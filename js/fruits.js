// ============================================================================
// Procedural low-poly fruit meshes. Every fruit provides:
//   buildWhole(def) -> THREE.Group           (the flying, sliceable fruit)
//   buildHalves(def) -> { a, b, axis }       (two halves + local separation axis)
// Halves are authored so `axis` is the direction half `a` should fly; the
// slicer rotates the pair so that axis lines up with the swipe's normal.
// ============================================================================

import * as THREE from '../lib/three.module.min.js';

const matCache = new Map();

export function flatMat(color) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, flatShading: true, roughness: 0.82, metalness: 0.0,
    });
    matCache.set(color, m);
  }
  return m;
}

function mesh(geo, color) {
  return new THREE.Mesh(geo, flatMat(color));
}

// --- shared pieces -----------------------------------------------------------

function stem(color = 0x6b4b2a, h = 0.28) {
  const s = mesh(new THREE.CylinderGeometry(0.045, 0.07, h, 5), color);
  s.position.y = h / 2;
  return s;
}

function leaf(color = 0x37b24d) {
  const l = mesh(new THREE.SphereGeometry(0.16, 5, 4), color);
  l.scale.set(1.6, 0.45, 0.8);
  return l;
}

// Hemisphere shell occupying local z >= 0 (flat, open face on the XY plane),
// capped with a flesh disc that faces -z. Used by all round fruits.
function fleshHalf(def, r) {
  const g = new THREE.Group();
  const shell = mesh(new THREE.SphereGeometry(r, 12, 9, 0, Math.PI), def.skin);
  g.add(shell);

  const cap = new THREE.Group();
  const rindRing = mesh(new THREE.RingGeometry(r * 0.86, r, 20), def.rind);
  const fleshDisc = mesh(new THREE.CircleGeometry(r * 0.87, 20), def.flesh);
  fleshDisc.position.z = -0.005;
  cap.add(rindRing, fleshDisc);

  // Seeds / segment detail on the cut face.
  const seedColor = def.id === 'watermelon' ? 0x232323 : def.accent;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5;
    const seed = mesh(new THREE.CircleGeometry(r * 0.07, 6), seedColor);
    seed.position.set(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, -0.01);
    cap.add(seed);
  }
  cap.rotation.y = Math.PI; // face outward (-z)
  g.add(cap);
  return g;
}

function sphereHalves(def, r, scaleY = 1) {
  const a = fleshHalf(def, r);
  const b = fleshHalf(def, r);
  b.rotation.y = Math.PI; // occupy z <= 0, cap facing +z
  a.scale.y = scaleY;
  b.scale.y = scaleY;
  return { a, b, axis: new THREE.Vector3(0, 0, 1) };
}

// --- fruit builders ----------------------------------------------------------

const builders = {
  watermelon: {
    whole(def) {
      const g = new THREE.Group();
      const body = mesh(new THREE.IcosahedronGeometry(def.radius, 1), def.skin);
      body.scale.y = 1.22;
      g.add(body);
      // Darker stripes: thin flattened bands hugging the body.
      for (let i = 0; i < 4; i++) {
        const band = mesh(new THREE.TorusGeometry(def.radius * 0.99, 0.045, 4, 18), def.accent);
        band.rotation.x = Math.PI / 2;
        band.rotation.z = (i / 4) * Math.PI;
        band.scale.set(1, 1, 1.24 / 0.99);
        band.rotation.y = (i / 4) * Math.PI;
        g.add(band);
      }
      return g;
    },
    halves(def) { return sphereHalves(def, def.radius, 1.22); },
  },

  orange: {
    whole(def) {
      const g = new THREE.Group();
      g.add(mesh(new THREE.IcosahedronGeometry(def.radius, 1), def.skin));
      const s = stem(0x4c7a2f, 0.18);
      s.position.y = def.radius * 0.92;
      g.add(s);
      return g;
    },
    halves(def) { return sphereHalves(def, def.radius); },
  },

  apple: {
    whole(def) {
      const g = new THREE.Group();
      const body = mesh(new THREE.IcosahedronGeometry(def.radius, 1), def.skin);
      body.scale.y = 0.94;
      g.add(body);
      const s = stem();
      s.position.y = def.radius * 0.8;
      g.add(s);
      const lf = leaf();
      lf.position.set(0.16, def.radius * 0.92, 0);
      lf.rotation.z = -0.5;
      g.add(lf);
      return g;
    },
    halves(def) { return sphereHalves(def, def.radius, 0.94); },
  },

  banana: {
    whole(def) {
      const g = new THREE.Group();
      const R = def.radius * 0.95, arc = 2.3;
      const geo = new THREE.TorusGeometry(R, def.radius * 0.34, 6, 12, arc);
      geo.rotateZ(-arc / 2);       // arc symmetric about +x
      geo.translate(-R * 0.75, 0, 0);
      const body = mesh(geo, def.skin);
      body.rotation.z = Math.PI / 2; // curve opens sideways, tips up
      g.add(body);
      const tip = mesh(new THREE.ConeGeometry(0.1, 0.22, 5), def.accent);
      tip.position.set(0, def.radius * 1.05, 0);
      g.add(tip);
      return g;
    },
    halves(def) {
      const R = def.radius * 0.95, tube = def.radius * 0.34, arc = 2.3;
      const make = (start) => {
        const grp = new THREE.Group();
        const geo = new THREE.TorusGeometry(R, tube, 6, 6, arc / 2);
        geo.rotateZ(start);
        geo.translate(-R * 0.75, 0, 0);
        grp.add(mesh(geo, def.skin));
        // flesh cap at the cut end (mid-arc, at angle 0 after our rotations)
        const cap = mesh(new THREE.CircleGeometry(tube, 10), def.flesh);
        cap.position.set(R - R * 0.75, 0, 0);
        grp.add(cap);
        return grp;
      };
      const a = make(0);          // upper arc half
      const b = make(-arc / 2);   // lower arc half
      a.rotation.z = Math.PI / 2;
      b.rotation.z = Math.PI / 2;
      return { a, b, axis: new THREE.Vector3(0, 1, 0) };
    },
  },

  pineapple: {
    whole(def) {
      const g = new THREE.Group();
      const body = mesh(new THREE.CylinderGeometry(def.radius * 0.52, def.radius * 0.62, def.radius * 1.5, 8), def.skin);
      g.add(body);
      // criss-cross texture hint: two accent bands
      for (const y of [-0.3, 0.25]) {
        const band = mesh(new THREE.TorusGeometry(def.radius * 0.56, 0.035, 4, 10), 0xc79420);
        band.rotation.x = Math.PI / 2;
        band.position.y = y * def.radius;
        g.add(band);
      }
      const crownY = def.radius * 0.75;
      for (let i = 0; i < 5; i++) {
        const spike = mesh(new THREE.ConeGeometry(0.13, 0.65, 4), def.accent);
        const a = (i / 5) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.16, crownY + 0.28, Math.sin(a) * 0.16);
        spike.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        g.add(spike);
      }
      const mid = mesh(new THREE.ConeGeometry(0.15, 0.8, 4), def.accent);
      mid.position.y = crownY + 0.38;
      g.add(mid);
      return g;
    },
    halves(def) {
      const h = def.radius * 0.75;
      const top = new THREE.Group();
      const topBody = mesh(new THREE.CylinderGeometry(def.radius * 0.52, def.radius * 0.57, h, 8), def.skin);
      topBody.position.y = h / 2;
      top.add(topBody);
      const crown = mesh(new THREE.ConeGeometry(0.16, 0.8, 4), def.accent);
      crown.position.y = h + 0.35;
      top.add(crown);
      const capT = mesh(new THREE.CircleGeometry(def.radius * 0.57, 16), def.flesh);
      capT.rotation.x = Math.PI / 2; // face -y
      top.add(capT);

      const bottom = new THREE.Group();
      const botBody = mesh(new THREE.CylinderGeometry(def.radius * 0.57, def.radius * 0.62, h, 8), def.skin);
      botBody.position.y = -h / 2;
      bottom.add(botBody);
      const capB = mesh(new THREE.CircleGeometry(def.radius * 0.57, 16), def.flesh);
      capB.rotation.x = -Math.PI / 2; // face +y
      bottom.add(capB);

      return { a: top, b: bottom, axis: new THREE.Vector3(0, 1, 0) };
    },
  },
};

export function buildWhole(def) {
  return builders[def.id].whole(def);
}

export function buildHalves(def) {
  return builders[def.id].halves(def);
}

// The bomb core revealed when a "fruit" turns out to be a fake.
export function buildBombCore() {
  const g = new THREE.Group();
  const body = mesh(new THREE.IcosahedronGeometry(0.55, 1), 0x1f1f27);
  g.add(body);
  const neck = mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.18, 6), 0x3a3a46);
  neck.position.y = 0.55;
  g.add(neck);
  const fuse = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 4), 0xc9a227);
  fuse.position.y = 0.78;
  fuse.rotation.z = 0.4;
  g.add(fuse);
  return g;
}
