// ============================================================================
// The blender — the game's guarantee that a round reaches its rolled result.
//
// A round's outcome is decided before it starts, but every value event used to
// come from a player slice, so an idle player finished at $0 no matter what
// the roll said. The blender closes that hole: it patrols the bottom of the
// screen and catches falling fruit, feeding those fruit through the exact same
// director that scores slices. It only gets hungry when the round total drifts
// off the pace toward its target, so an engaged player barely notices it while
// an idle one still watches the total climb (or drop) to where it belongs.
// ============================================================================

import * as THREE from '../lib/three.module.min.js';

// depthWrite off so whatever is inside the jar (juice, blades) shows through
const glassMat = new THREE.MeshStandardMaterial({
  color: 0xdfefff, transparent: true, opacity: 0.24, depthWrite: false,
  roughness: 0.06, metalness: 0.1, side: THREE.DoubleSide,
});
const metalMat = new THREE.MeshStandardMaterial({
  color: 0xc3ccdb, roughness: 0.32, metalness: 0.65,
});
const bodyMat = new THREE.MeshStandardMaterial({
  color: 0x3a4260, roughness: 0.55, metalness: 0.15,
});
const bladeMat = new THREE.MeshStandardMaterial({
  color: 0xe6ecf5, roughness: 0.2, metalness: 0.85,
});

export class Blender {
  constructor(scene, cfg) {
    this.cfg = cfg;
    this.radius = cfg.radius;
    this.x = 0;
    this.targetX = 0;
    this.t = Math.random() * 10;
    this.cooldown = 0;
    this.hunting = false;
    this.jolt = 0;
    this.juice = 0.1;
    this.juiceTarget = 0.1;

    const R = cfg.radius, H = 1.75;
    this.jarHeight = H;

    const g = new THREE.Group();
    this.group = g;

    // glass jar, open at the top (the catch mouth sits at local y = 0)
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.84, H, 30, 1, true), glassMat);
    jar.position.y = -H / 2;
    g.add(jar);

    const jarFloor = new THREE.Mesh(new THREE.CircleGeometry(R * 0.84, 30), metalMat);
    jarFloor.rotation.x = -Math.PI / 2;
    jarFloor.position.y = -H + 0.01;
    g.add(jarFloor);

    // chunky rim so the mouth reads clearly against the sky
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.075, 14, 40), metalMat);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);

    // juice that builds up as fruit goes in
    this.juiceMat = new THREE.MeshStandardMaterial({
      color: 0xff5d5d, transparent: true, opacity: 0.85, roughness: 0.25,
    });
    this.juiceMesh = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.78, 1, 26), this.juiceMat);
    g.add(this.juiceMesh);

    // spinning blades just above the jar floor
    this.blades = new THREE.Group();
    this.blades.position.y = -H + 0.16;
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(R * 1.15, 0.035, 0.16), bladeMat);
      blade.rotation.y = i * Math.PI / 2;
      blade.rotation.z = 0.22;
      this.blades.add(blade);
    }
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.22, 10), metalMat);
    this.blades.add(spindle);
    g.add(this.blades);

    // motor base
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.88, R * 0.95, 0.2, 26), metalMat);
    collar.position.y = -H - 0.1;
    g.add(collar);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.0, R * 1.18, 0.7, 26), bodyMat);
    base.position.y = -H - 0.55;
    g.add(base);

    const stripe = new THREE.Mesh(new THREE.TorusGeometry(R * 1.06, 0.045, 10, 30), metalMat);
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = -H - 0.42;
    g.add(stripe);

    // status light — dim while patrolling, bright while hunting
    this.lightMat = new THREE.MeshStandardMaterial({
      color: 0x59d98a, emissive: 0x2f8f57, emissiveIntensity: 0.4,
    });
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), this.lightMat);
    light.position.set(0, -H - 0.45, R * 1.02);
    g.add(light);

    scene.add(g);
    this.syncJuice();
  }

  syncJuice() {
    const H = this.jarHeight;
    const h = Math.max(0.02, this.juice * (H - 0.1));
    this.juiceMesh.scale.y = h;
    this.juiceMesh.position.y = -H + 0.04 + h / 2;
  }

  // Called when a fruit goes in: bump the level, blend the colour, squash.
  absorb(color) {
    this.juiceTarget = Math.min(0.85, this.juiceTarget + 0.09);
    this.juiceMat.color.lerp(new THREE.Color(color), 0.6);
    this.jolt = 1;
  }

  reset() {
    this.juice = this.juiceTarget = 0.1;
    this.juiceMat.color.set(0xff5d5d);
    this.syncJuice();
  }

  update(dt, { halfW, huntX }) {
    this.t += dt;
    const cfg = this.cfg;
    const limit = Math.max(0.5, halfW - this.radius - 0.3);

    this.hunting = huntX !== null && huntX !== undefined;
    if (this.hunting) {
      this.targetX = THREE.MathUtils.clamp(huntX, -limit, limit);
    } else {
      // lazy patrol across the play area
      this.targetX = Math.sin(this.t * 0.42) * limit * 0.72;
    }

    const speed = this.hunting ? cfg.huntSpeed : cfg.patrolSpeed;
    const dx = this.targetX - this.x;
    const step = Math.sign(dx) * Math.min(Math.abs(dx), speed * dt);
    this.x += step;
    this.group.position.x = this.x;

    // lean into the movement for a bit of cartoon weight
    const vel = dt > 0 ? step / dt : 0;
    this.group.rotation.z += (THREE.MathUtils.clamp(-vel * 0.03, -0.16, 0.16) - this.group.rotation.z) * Math.min(1, dt * 8);

    this.blades.rotation.y += (this.hunting ? 15 : 5.5) * dt;
    this.lightMat.emissiveIntensity = this.hunting
      ? 0.9 + 0.5 * Math.sin(this.t * 10)
      : 0.35;
    this.lightMat.color.set(this.hunting ? 0xffc832 : 0x59d98a);
    this.lightMat.emissive.set(this.hunting ? 0xb07800 : 0x2f8f57);

    // squash-and-stretch after a catch
    if (this.jolt > 0.001) {
      this.jolt = Math.max(0, this.jolt - dt * 3.4);
      const j = this.jolt;
      this.group.scale.set(1 + 0.11 * j, 1 - 0.13 * j, 1 + 0.11 * j);
    } else {
      this.group.scale.set(1, 1, 1);
    }

    if (Math.abs(this.juice - this.juiceTarget) > 0.001) {
      this.juice += (this.juiceTarget - this.juice) * Math.min(1, dt * 5);
      this.syncJuice();
    }
  }

  // World position of the mouth, where catch effects play.
  mouth() {
    return new THREE.Vector3(this.x, this.group.position.y + 0.15, 0);
  }
}
