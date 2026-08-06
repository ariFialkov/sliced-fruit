// ============================================================================
// Procedural fruit meshes — smooth, sleek, cartoony shapes. Every fruit
// provides:
//   buildWhole(def) -> THREE.Group           (the flying, sliceable fruit)
//   buildHalves(def) -> { a, b, axis }       (two halves + local separation axis)
// Halves are authored so `axis` is the direction half `a` should fly; the
// slicer rotates the pair so that axis lines up with the swipe's normal.
// ============================================================================

import * as THREE from '../lib/three.module.min.js';

const matCache = new Map();

export function fruitMat(color) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.0 });
    matCache.set(color, m);
  }
  return m;
}

function mesh(geo, color) {
  return new THREE.Mesh(geo, fruitMat(color));
}

// Shiny golden variant for bonus fruit. Modest metalness — there is no
// environment map, so high metalness would just read as black.
const goldMat = new THREE.MeshStandardMaterial({
  color: 0xffc832, metalness: 0.35, roughness: 0.3,
  emissive: 0x996b00, emissiveIntensity: 0.45,
});

export function applyGoldSkin(group) {
  group.traverse((o) => { if (o.isMesh) o.material = goldMat; });
}

// Self-lit variant used during frenzy so fruit glows in the darkness.
const glowCache = new Map();

export function applyGlow(group) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    const base = o.material;
    let m = glowCache.get(base);
    if (!m) {
      m = base.clone();
      m.emissive = base.color.clone();
      m.emissiveIntensity = 0.55;
      glowCache.set(base, m);
    }
    o.material = m;
  });
}

function ball(r, color) {
  return mesh(new THREE.SphereGeometry(r, 24, 18), color);
}

// --- shared pieces -----------------------------------------------------------

function stem(color = 0x6b4b2a, h = 0.28) {
  const s = mesh(new THREE.CylinderGeometry(0.045, 0.07, h, 8), color);
  s.position.y = h / 2;
  return s;
}

function leaf(color = 0x37b24d) {
  const l = mesh(new THREE.SphereGeometry(0.16, 10, 8), color);
  l.scale.set(1.6, 0.45, 0.8);
  return l;
}

// Hemisphere shell occupying local z >= 0 (flat, open face on the XY plane),
// capped with a flesh disc that faces -z. Used by all round fruits.
function fleshHalf(def, r, { seeds = true } = {}) {
  const g = new THREE.Group();
  const shell = mesh(new THREE.SphereGeometry(r, 24, 18, 0, Math.PI), def.skin);
  g.add(shell);

  const cap = new THREE.Group();
  const rindRing = mesh(new THREE.RingGeometry(r * 0.86, r, 32), def.rind);
  const fleshDisc = mesh(new THREE.CircleGeometry(r * 0.87, 32), def.flesh);
  fleshDisc.position.z = -0.005;
  cap.add(rindRing, fleshDisc);

  if (seeds) {
    // Seeds / segment detail on the cut face.
    const seedColor = def.id === 'watermelon' ? 0x232323 : def.accent;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.5;
      const seed = mesh(new THREE.CircleGeometry(r * 0.07, 10), seedColor);
      seed.position.set(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, -0.01);
      cap.add(seed);
    }
  }
  cap.rotation.y = Math.PI; // face outward (-z)
  g.add(cap);
  return g;
}

function sphereHalves(def, r, scaleY = 1, opts) {
  const a = fleshHalf(def, r, opts);
  const b = fleshHalf(def, r, opts);
  b.rotation.y = Math.PI; // occupy z <= 0, cap facing +z
  a.scale.y = scaleY;
  b.scale.y = scaleY;
  return { a, b, axis: new THREE.Vector3(0, 0, 1) };
}

// --- banana sweep ------------------------------------------------------------
// A tube swept along a bezier "smile" curve with the radius tapering to
// pointed tips — a proper banana silhouette, smooth from any angle.

function bananaCurve(def) {
  const R = def.radius;
  return new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-R * 1.1, R * 0.5, 0),
    new THREE.Vector3(0, -R * 1.0, 0),
    new THREE.Vector3(R * 1.1, R * 0.5, 0),
  );
}

function bananaGeometry(def, t0, t1) {
  const R = def.radius;
  const curve = bananaCurve(def);
  const SEG = 24, RAD = 16;
  const bin = new THREE.Vector3(0, 0, 1); // curve is planar, so this is constant
  const positions = [];
  const indices = [];
  for (let i = 0; i <= SEG; i++) {
    const t = t0 + (t1 - t0) * (i / SEG);
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const nor = new THREE.Vector3().crossVectors(tan, bin).normalize();
    const rad = R * 0.36 * (0.05 + 0.95 * Math.pow(Math.sin(Math.PI * t), 0.7));
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2;
      const c = Math.cos(a) * rad, s = Math.sin(a) * rad;
      positions.push(p.x + nor.x * c + bin.x * s, p.y + nor.y * c + bin.y * s, p.z + nor.z * c + bin.z * s);
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < RAD; j++) {
      const a = i * (RAD + 1) + j, b = a + RAD + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// --- pineapple profile -------------------------------------------------------
// Smooth lathe barrel; the halves reuse subsets of the same profile so the
// cut lines up exactly.

const PINE_PROFILE = [
  [0.03, -0.78], [0.30, -0.74], [0.50, -0.55], [0.60, -0.25], [0.62, 0.0],
  [0.58, 0.28], [0.48, 0.55], [0.26, 0.72], [0.03, 0.76],
];

function latheFrom(profile, R) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r * R, y * R * 1.1));
  return new THREE.LatheGeometry(pts, 28);
}

function pineappleCrown(def) {
  const crown = new THREE.Group();
  const topY = def.radius * 1.1 * 0.76;
  const addLeaf = (angle, tilt, len, dist) => {
    const leaf = mesh(new THREE.ConeGeometry(0.09, len, 8), def.accent);
    leaf.scale.z = 0.55;
    leaf.position.set(Math.cos(angle) * dist, topY + len * 0.42, Math.sin(angle) * dist);
    leaf.rotation.set(Math.sin(angle) * tilt, 0, -Math.cos(angle) * tilt);
    crown.add(leaf);
  };
  for (let i = 0; i < 6; i++) addLeaf((i / 6) * Math.PI * 2, 0.6, 0.55, 0.14);
  for (let i = 0; i < 4; i++) addLeaf((i / 4) * Math.PI * 2 + 0.6, 0.28, 0.68, 0.07);
  addLeaf(0, 0, 0.75, 0);
  return crown;
}

// --- fruit builders ----------------------------------------------------------

const builders = {
  watermelon: {
    whole(def) {
      const g = new THREE.Group();
      const body = ball(def.radius, def.skin);
      body.scale.y = 1.22;
      g.add(body);
      // Darker stripes: thin bands hugging the body.
      for (let i = 0; i < 4; i++) {
        const band = mesh(new THREE.TorusGeometry(def.radius * 0.99, 0.045, 8, 36), def.accent);
        band.rotation.x = Math.PI / 2;
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
      g.add(ball(def.radius, def.skin));
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
      const body = ball(def.radius, def.skin);
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
      g.add(mesh(bananaGeometry(def, 0, 1), def.skin));
      // little brown nubs on both tips
      const curve = bananaCurve(def);
      for (const t of [0, 1]) {
        const nub = mesh(new THREE.SphereGeometry(def.radius * 0.07, 8, 6), 0x6b4b2a);
        nub.position.copy(curve.getPoint(t));
        g.add(nub);
      }
      return g;
    },
    halves(def) {
      const curve = bananaCurve(def);
      const mid = curve.getPoint(0.5);
      const capR = def.radius * 0.36;

      const right = new THREE.Group(); // occupies x > 0
      right.add(mesh(bananaGeometry(def, 0.5, 1), def.skin));
      const capA = mesh(new THREE.CircleGeometry(capR, 18), def.flesh);
      capA.rotation.y = -Math.PI / 2; // face -x, covering the cut
      capA.position.copy(mid);
      right.add(capA);

      const left = new THREE.Group(); // occupies x < 0
      left.add(mesh(bananaGeometry(def, 0, 0.5), def.skin));
      const capB = mesh(new THREE.CircleGeometry(capR, 18), def.flesh);
      capB.rotation.y = Math.PI / 2; // face +x
      capB.position.copy(mid);
      left.add(capB);

      return { a: right, b: left, axis: new THREE.Vector3(1, 0, 0) };
    },
  },

  pineapple: {
    whole(def) {
      const g = new THREE.Group();
      g.add(mesh(latheFrom(PINE_PROFILE, def.radius), def.skin));
      // subtle accent bands following the barrel silhouette
      for (const [r, y] of [[0.60, -0.25], [0.58, 0.28]]) {
        const band = mesh(new THREE.TorusGeometry(def.radius * r, 0.028, 8, 32), 0xc79420);
        band.rotation.x = Math.PI / 2;
        band.position.y = y * def.radius * 1.1;
        g.add(band);
      }
      g.add(pineappleCrown(def));
      return g;
    },
    halves(def) {
      const capR = def.radius * 0.62;

      const top = new THREE.Group();
      top.add(mesh(latheFrom(PINE_PROFILE.slice(4), def.radius), def.skin));
      top.add(pineappleCrown(def));
      const capT = mesh(new THREE.CircleGeometry(capR, 28), def.flesh);
      capT.rotation.x = Math.PI / 2; // face -y
      top.add(capT);

      const bottom = new THREE.Group();
      bottom.add(mesh(latheFrom(PINE_PROFILE.slice(0, 5), def.radius), def.skin));
      const capB = mesh(new THREE.CircleGeometry(capR, 28), def.flesh);
      capB.rotation.x = -Math.PI / 2; // face +y
      bottom.add(capB);

      return { a: top, b: bottom, axis: new THREE.Vector3(0, 1, 0) };
    },
  },

  lemon: {
    whole(def) {
      const g = new THREE.Group();
      const body = ball(def.radius, def.skin);
      body.scale.set(0.85, 1.25, 0.85);
      g.add(body);
      // the two little pointed nubs
      for (const dir of [1, -1]) {
        const nub = mesh(new THREE.SphereGeometry(def.radius * 0.28, 12, 10), def.skin);
        nub.position.y = dir * def.radius * 1.18;
        nub.scale.set(0.7, 1.1, 0.7);
        g.add(nub);
      }
      return g;
    },
    halves(def) { return sphereHalves(def, def.radius * 0.92, 1.2); },
  },

  passionfruit: {
    whole(def) {
      const g = new THREE.Group();
      g.add(ball(def.radius, def.skin));
      const s = stem(0x5c8038, 0.16);
      s.position.y = def.radius * 0.94;
      g.add(s);
      return g;
    },
    halves(def) { return sphereHalves(def, def.radius); },
  },

  pomegranate: {
    whole(def) {
      const g = new THREE.Group();
      g.add(ball(def.radius, def.skin));
      // the little calyx crown on top
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = mesh(new THREE.ConeGeometry(0.06, 0.22, 6), def.skin);
        spike.position.set(Math.cos(a) * 0.11, def.radius * 0.98 + 0.08, Math.sin(a) * 0.11);
        spike.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
        g.add(spike);
      }
      return g;
    },
    halves(def) { return sphereHalves(def, def.radius); },
  },

  avocado: {
    whole(def) {
      const g = new THREE.Group();
      const body = ball(def.radius, def.skin);
      body.scale.set(0.88, 1.28, 0.88);
      g.add(body);
      const neck = mesh(new THREE.SphereGeometry(def.radius * 0.55, 16, 12), def.skin);
      neck.position.y = def.radius * 0.85;
      neck.scale.set(0.85, 1, 0.85);
      g.add(neck);
      const s = stem(0x4a3521, 0.14);
      s.position.y = def.radius * 1.42;
      g.add(s);
      return g;
    },
    halves(def) {
      const { a, b, axis } = sphereHalves(def, def.radius * 0.95, 1.22, { seeds: false });
      // the big pit, bulging out of one half's cut face
      const pit = mesh(new THREE.SphereGeometry(def.radius * 0.42, 16, 12), 0x6b4423);
      pit.position.z = -0.02;
      a.add(pit);
      // matching socket shading on the other half
      const socket = mesh(new THREE.CircleGeometry(def.radius * 0.4, 24), 0x8a9a55);
      socket.rotation.y = Math.PI;
      socket.position.z = -0.02;
      b.add(socket);
      return { a, b, axis };
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
  const body = ball(0.55, 0x1f1f27);
  g.add(body);
  const neck = mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.18, 10), 0x3a3a46);
  neck.position.y = 0.55;
  g.add(neck);
  const fuse = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), 0xc9a227);
  fuse.position.y = 0.78;
  fuse.rotation.z = 0.4;
  g.add(fuse);
  return g;
}
