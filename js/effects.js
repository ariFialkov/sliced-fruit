// ============================================================================
// Visual effects: juice bursts, splats, bomb explosions, flying fruit halves.
// All effects are simple particle groups updated by the game loop; they
// register themselves with an EffectSystem that owns their lifecycle.
// ============================================================================

import * as THREE from '../lib/three.module.min.js';
import { fruitMat, buildBombCore } from './fruits.js';
import { rand } from './rng.js';

const shardGeo = new THREE.SphereGeometry(0.1, 8, 6);
const puffGeo = new THREE.SphereGeometry(0.3, 10, 8);
const splatGeo = new THREE.CircleGeometry(1, 20);

function splatMat(color) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, depthWrite: false,
  });
}

// --- gold aura ---------------------------------------------------------------
// Soft radial glow + twinkling sparkles that ride along with a golden fruit,
// so the bonus item is unmistakable at a glance.

let auraTexMemo = null;
function auraTexture() {
  if (auraTexMemo) return auraTexMemo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255, 226, 120, 0.85)');
  g.addColorStop(0.35, 'rgba(255, 200, 60, 0.4)');
  g.addColorStop(1, 'rgba(255, 190, 40, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  auraTexMemo = new THREE.CanvasTexture(c);
  auraTexMemo.colorSpace = THREE.SRGBColorSpace;
  return auraTexMemo;
}

let sparkleTexMemo = null;
function sparkleTexture() {
  if (sparkleTexMemo) return sparkleTexMemo;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 1, 32, 32, 30);
  g.addColorStop(0, 'rgba(255, 250, 220, 1)');
  g.addColorStop(0.25, 'rgba(255, 220, 90, 0.9)');
  g.addColorStop(1, 'rgba(255, 220, 90, 0)');
  ctx.fillStyle = g;
  // 4-point star: two slim lozenges over the radial core
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255, 250, 230, 0.95)';
  ctx.beginPath();
  ctx.moveTo(32, 2); ctx.lineTo(37, 32); ctx.lineTo(32, 62); ctx.lineTo(27, 32);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, 32); ctx.lineTo(32, 27); ctx.lineTo(62, 32); ctx.lineTo(32, 37);
  ctx.closePath(); ctx.fill();
  sparkleTexMemo = new THREE.CanvasTexture(c);
  sparkleTexMemo.colorSpace = THREE.SRGBColorSpace;
  return sparkleTexMemo;
}

export class GoldAura {
  constructor(radius) {
    this.group = new THREE.Group();
    this.t = rand(0, 10);

    this.glowMat = new THREE.SpriteMaterial({
      map: auraTexture(), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0.9,
    });
    this.glow = new THREE.Sprite(this.glowMat);
    this.glowBase = radius * 4.6;
    this.glow.scale.setScalar(this.glowBase);
    this.glow.renderOrder = 5;
    this.group.add(this.glow);

    this.sparks = [];
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.SpriteMaterial({
        map: sparkleTexture(), transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const s = new THREE.Sprite(mat);
      s.renderOrder = 6;
      this.group.add(s);
      this.sparks.push({
        sprite: s, mat,
        angle: rand(0, Math.PI * 2),
        speed: rand(0.8, 1.6) * (Math.random() < 0.5 ? -1 : 1),
        orbit: radius * rand(1.35, 1.85),
        tilt: rand(-0.5, 0.5),
        phase: rand(0, Math.PI * 2),
        size: radius * rand(0.34, 0.55),
      });
    }
  }

  update(dt) {
    this.t += dt;
    const pulse = 1 + 0.09 * Math.sin(this.t * 3.2);
    this.glow.scale.setScalar(this.glowBase * pulse);
    this.glowMat.opacity = 0.75 + 0.2 * Math.sin(this.t * 3.2);
    for (const sp of this.sparks) {
      sp.angle += sp.speed * dt;
      sp.sprite.position.set(
        Math.cos(sp.angle) * sp.orbit,
        Math.sin(sp.angle) * sp.orbit * (1 - Math.abs(sp.tilt) * 0.4),
        Math.sin(sp.angle * 2) * sp.tilt,
      );
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(this.t * 3.4 + sp.phase));
      sp.mat.opacity = tw;
      sp.sprite.scale.setScalar(sp.size * (0.6 + 0.5 * tw));
    }
  }

  dispose() {
    this.glowMat.dispose();
    for (const sp of this.sparks) sp.mat.dispose();
  }
}

export class EffectSystem {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];
  }

  add(effect) {
    this.effects.push(effect);
    this.scene.add(effect.group);
  }

  update(dt, gravity) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        this.scene.remove(fx.group);
        fx.dispose?.();
        this.effects.splice(i, 1);
      } else {
        fx.update(dt, gravity);
      }
    }
  }

  clear() {
    for (const fx of this.effects) {
      this.scene.remove(fx.group);
      fx.dispose?.();
    }
    this.effects.length = 0;
  }

  // -- concrete effects -------------------------------------------------------

  juiceBurst(pos, color, count = 14, speed = 6) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const parts = [];
    const mat = fruitMat(color);
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(shardGeo, mat);
      const s = rand(0.5, 1.4);
      p.scale.setScalar(s);
      const a = rand(0, Math.PI * 2), up = rand(0.1, 1);
      p.userData.vel = new THREE.Vector3(
        Math.cos(a) * rand(0.3, 1) * speed,
        up * speed,
        Math.sin(a) * rand(0.2, 0.6) * speed,
      );
      group.add(p);
      parts.push(p);
    }
    this.add({
      group, life: 0.9, total: 0.9,
      update(dt, g) {
        for (const p of parts) {
          p.userData.vel.y -= g * dt;
          p.position.addScaledVector(p.userData.vel, dt);
          p.scale.multiplyScalar(Math.max(0, 1 - dt * 1.6));
        }
      },
    });
  }

  splat(pos, color) {
    const group = new THREE.Group();
    group.position.copy(pos);
    group.position.z -= 0.6;
    const mat = splatMat(color);
    const blobs = [];
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(splatGeo, mat);
      const a = rand(0, Math.PI * 2), d = i === 0 ? 0 : rand(0.25, 0.75);
      b.position.set(Math.cos(a) * d, Math.sin(a) * d, i * 0.002);
      b.scale.setScalar(i === 0 ? rand(0.55, 0.7) : rand(0.15, 0.35));
      group.add(b);
      blobs.push(b);
    }
    const total = 0.8;
    this.add({
      group, life: total, total,
      update(dt) {
        for (const b of blobs) b.scale.multiplyScalar(1 + dt * 0.6);
        mat.opacity = Math.max(0, mat.opacity - dt / total);
        group.position.y -= dt * 0.5; // juice dribbles down
      },
      dispose() { mat.dispose(); },
    });
  }

  // Two pre-built halves flying apart. `quat` orients the cut, `dir` is the
  // world direction half `a` flies.
  halves(pos, vel, pieces, quat, dir) {
    const group = new THREE.Group();
    group.position.copy(pos);
    const { a, b } = pieces;
    const holderA = new THREE.Group();
    const holderB = new THREE.Group();
    holderA.add(a); holderB.add(b);
    holderA.quaternion.copy(quat);
    holderB.quaternion.copy(quat);
    group.add(holderA, holderB);

    const kick = rand(2.6, 3.6);
    const velA = vel.clone().addScaledVector(dir, kick);
    const velB = vel.clone().addScaledVector(dir, -kick);
    velA.y += 1.2; velB.y += 0.6;
    const spinA = new THREE.Vector3(rand(-4, 4), rand(-4, 4), rand(-4, 4));
    const spinB = spinA.clone().negate();

    const total = 1.4;
    this.add({
      group, life: total, total,
      update(dt, g) {
        velA.y -= g * dt; velB.y -= g * dt;
        holderA.position.addScaledVector(velA, dt);
        holderB.position.addScaledVector(velB, dt);
        holderA.rotation.x += spinA.x * dt; holderA.rotation.y += spinA.y * dt; holderA.rotation.z += spinA.z * dt;
        holderB.rotation.x += spinB.x * dt; holderB.rotation.y += spinB.y * dt; holderB.rotation.z += spinB.z * dt;
      },
    });
  }

  bombExplosion(pos, vel) {
    // Charred core tumbling away…
    const core = buildBombCore();
    const coreGroup = new THREE.Group();
    coreGroup.position.copy(pos);
    coreGroup.add(core);
    const coreVel = vel.clone().multiplyScalar(0.3);
    coreVel.y = Math.abs(coreVel.y) * 0.2 + 2;
    this.add({
      group: coreGroup, life: 0.9, total: 0.9,
      update(dt, g) {
        coreVel.y -= g * dt;
        core.position.addScaledVector(coreVel, dt);
        core.rotation.x += dt * 6; core.rotation.z += dt * 4;
        core.scale.multiplyScalar(Math.max(0, 1 - dt * 1.2));
      },
    });

    // …flash…
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfff3bf, transparent: true, opacity: 0.95, depthWrite: false,
    });
    const flash = new THREE.Mesh(puffGeo, flashMat);
    flash.scale.setScalar(1.2);
    const flashGroup = new THREE.Group();
    flashGroup.position.copy(pos);
    flashGroup.add(flash);
    this.add({
      group: flashGroup, life: 0.22, total: 0.22,
      update(dt) {
        flash.scale.multiplyScalar(1 + dt * 26);
        flashMat.opacity = Math.max(0, flashMat.opacity - dt * 5);
      },
      dispose() { flashMat.dispose(); },
    });

    // …sparks and smoke.
    this.juiceBurst(pos, 0xffa94d, 16, 8);
    this.juiceBurst(pos, 0xffd43b, 10, 10);

    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x494952, transparent: true, opacity: 0.55, depthWrite: false,
    });
    const smokeGroup = new THREE.Group();
    smokeGroup.position.copy(pos);
    const puffs = [];
    for (let i = 0; i < 7; i++) {
      const p = new THREE.Mesh(puffGeo, smokeMat);
      p.position.set(rand(-0.5, 0.5), rand(-0.3, 0.5), rand(-0.3, 0.3));
      p.scale.setScalar(rand(0.6, 1.3));
      p.userData.rise = rand(0.6, 1.6);
      smokeGroup.add(p);
      puffs.push(p);
    }
    const total = 1.1;
    this.add({
      group: smokeGroup, life: total, total,
      update(dt) {
        for (const p of puffs) {
          p.scale.multiplyScalar(1 + dt * 1.4);
          p.position.y += p.userData.rise * dt;
        }
        smokeMat.opacity = Math.max(0, smokeMat.opacity - dt / total * 0.6);
      },
      dispose() { smokeMat.dispose(); },
    });
  }
}
