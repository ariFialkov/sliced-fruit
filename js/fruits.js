// ============================================================================
// Procedural fruit meshes — smooth, high-poly, cartoon-clean. Every fruit
// provides:
//   buildWhole(def) -> THREE.Group           (the flying, sliceable fruit)
//   buildHalves(def) -> { a, b, axis }       (two halves + local separation axis)
// Halves are authored so `axis` is the direction half `a` should fly; the
// slicer rotates the pair so that axis lines up with the swipe's normal.
// Skins and cut faces are painted textures from textures.js.
// ============================================================================

import * as THREE from '../lib/three.module.min.js';
import * as T from './textures.js';

const matCache = new Map();

export function fruitMat(color) {
  let m = matCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.0 });
    matCache.set(color, m);
  }
  return m;
}

const texMatCache = new Map();
function texMat(tex, roughness = 0.5) {
  let m = texMatCache.get(tex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tex, roughness, metalness: 0.0 });
    texMatCache.set(tex, m);
  }
  return m;
}

function mesh(geo, matOrColor) {
  const mat = typeof matOrColor === 'number' ? fruitMat(matOrColor) : matOrColor;
  return new THREE.Mesh(geo, mat);
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
// Textured materials glow through their own map so colours stay true.
const glowCache = new Map();

export function applyGlow(group) {
  group.traverse((o) => {
    if (!o.isMesh) return;
    const base = o.material;
    let m = glowCache.get(base);
    if (!m) {
      m = base.clone();
      if (base.map) {
        m.emissiveMap = base.map;
        m.emissive = new THREE.Color(0xffffff);
      } else {
        m.emissive = base.color.clone();
      }
      m.emissiveIntensity = 0.55;
      glowCache.set(base, m);
    }
    o.material = m;
  });
}

// --- shared pieces -----------------------------------------------------------

function sphere(r, mat) {
  return mesh(new THREE.SphereGeometry(r, 40, 28), mat);
}

// Hemisphere occupying local z >= 0, open face on the XY plane. Its UVs are
// squeezed to half the texture so skin patterns keep their real scale.
function hemisphere(r, mat) {
  const geo = new THREE.SphereGeometry(r, 40, 28, 0, Math.PI);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
  return mesh(geo, mat);
}

function stem(color = 0x6b4b2a, h = 0.28, rTop = 0.045, rBot = 0.07) {
  const s = mesh(new THREE.CylinderGeometry(rTop, rBot, h, 12), color);
  s.position.y = h / 2;
  return s;
}

function leaf(color = 0x37b24d, len = 0.34) {
  const g = new THREE.Group();
  const blade = mesh(new THREE.SphereGeometry(len / 2, 20, 12), color);
  blade.scale.set(1, 0.32, 0.5);
  g.add(blade);
  const vein = mesh(new THREE.BoxGeometry(len * 0.9, 0.012, 0.02), new THREE.Color(color).multiplyScalar(0.7).getHex());
  vein.position.y = len * 0.16 * 0.5;
  g.add(vein);
  return g;
}

// Flat cut face: a textured disc facing -z (so it covers a hemisphere's
// open side once the hemisphere is rotated into place).
function cap(r, tex) {
  const c = mesh(new THREE.CircleGeometry(r, 56), texMat(tex, 0.62));
  c.rotation.y = Math.PI;
  c.position.z = -0.003;
  return c;
}

function fleshHalf(r, skinMat, faceTex) {
  const g = new THREE.Group();
  g.add(hemisphere(r, skinMat));
  g.add(cap(r, faceTex));
  return g;
}

function sphereHalves(r, skinMat, faceTex, scaleY = 1) {
  const a = fleshHalf(r, skinMat, faceTex);
  const b = fleshHalf(r, skinMat, faceTex);
  b.rotation.y = Math.PI; // occupy z <= 0, cap facing +z
  a.scale.y = scaleY;
  b.scale.y = scaleY;
  return { a, b, axis: new THREE.Vector3(0, 0, 1) };
}

// --- banana sweep ------------------------------------------------------------
// A tube swept along a bezier "smile" curve: radius tapers to the tips, the
// cross-section is gently five-ridged like a real banana, and UVs run along
// the length so the skin gradient (dark tip → ripe middle → stem) lines up.

function bananaCurve(def) {
  const R = def.radius;
  return new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-R * 1.1, R * 0.5, 0),
    new THREE.Vector3(0, -R * 1.0, 0),
    new THREE.Vector3(R * 1.1, R * 0.5, 0),
  );
}

function bananaRadius(def, t) {
  return def.radius * 0.36 * (0.05 + 0.95 * Math.pow(Math.sin(Math.PI * t), 0.7));
}

function bananaGeometry(def, t0, t1) {
  const curve = bananaCurve(def);
  const SEG = 36, RAD = 24;
  const bin = new THREE.Vector3(0, 0, 1);
  const positions = [], uvs = [], indices = [];
  for (let i = 0; i <= SEG; i++) {
    const t = t0 + (t1 - t0) * (i / SEG);
    const p = curve.getPoint(t);
    const nor = new THREE.Vector3().crossVectors(curve.getTangent(t), bin).normalize();
    const base = bananaRadius(def, t);
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2;
      const rad = base * (1 + 0.07 * Math.cos(5 * a)); // five soft ridges
      const c = Math.cos(a) * rad, s = Math.sin(a) * rad;
      positions.push(p.x + nor.x * c, p.y + nor.y * c, p.z + bin.z * s);
      uvs.push(t, j / RAD);
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
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// --- lathe helpers (pineapple, avocado) --------------------------------------

// Lathe a [r, y] profile. `slice` = [start, end] indices of the full profile
// so halves keep the same texture scale as the whole fruit; `phi` = [start,
// length] to lathe only part of the way round.
function lathe(profile, R, { slice, phi = [0, Math.PI * 2], yScale = 1 } = {}) {
  const [s0, s1] = slice ?? [0, profile.length - 1];
  const pts = profile.slice(s0, s1 + 1).map(([r, y]) => new THREE.Vector2(r * R, y * R * yScale));
  const geo = new THREE.LatheGeometry(pts, 40, phi[0], phi[1]);
  if (slice) {
    const uv = geo.attributes.uv, n = profile.length - 1;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (s0 + uv.getY(i) * (s1 - s0)) / n);
  }
  return geo;
}

const PINE_PROFILE = [
  [0.03, -0.78], [0.30, -0.74], [0.50, -0.55], [0.60, -0.25], [0.62, 0.0],
  [0.58, 0.28], [0.48, 0.55], [0.26, 0.72], [0.03, 0.76],
];
const PINE_CUT = 4; // index of the [0.62, 0] ring the halves are cut on

function pineappleCrown(def) {
  const crown = new THREE.Group();
  const topY = def.radius * 1.1 * 0.76;
  const greens = [0x2f9e44, 0x3aab52, 0x27883b];
  const addLeaf = (angle, tilt, len, dist, color) => {
    const l = mesh(new THREE.ConeGeometry(0.1, len, 10), color);
    l.scale.z = 0.42;
    l.position.set(Math.cos(angle) * dist, topY + len * 0.42, Math.sin(angle) * dist);
    l.rotation.set(Math.sin(angle) * tilt, 0, -Math.cos(angle) * tilt);
    crown.add(l);
  };
  for (let i = 0; i < 8; i++) addLeaf((i / 8) * Math.PI * 2, 0.78, 0.58, 0.16, greens[i % 3]);
  for (let i = 0; i < 5; i++) addLeaf((i / 5) * Math.PI * 2 + 0.5, 0.42, 0.74, 0.09, greens[(i + 1) % 3]);
  for (let i = 0; i < 3; i++) addLeaf((i / 3) * Math.PI * 2 + 1.1, 0.16, 0.86, 0.04, greens[(i + 2) % 3]);
  addLeaf(0, 0, 0.95, 0, greens[0]);
  return crown;
}

// Pear profile, bottom to top: fat body, soft neck, rounded top.
const AVO_PROFILE = [
  [0.0, -1.0], [0.34, -0.93], [0.56, -0.72], [0.65, -0.42], [0.63, -0.08],
  [0.54, 0.26], [0.44, 0.56], [0.32, 0.82], [0.14, 0.98], [0.0, 1.04],
];

function avocadoProfileScaled(def) {
  return AVO_PROFILE.map(([r, y]) => [r * def.radius, y * def.radius]);
}

// The flat pear-shaped cut face for an avocado half, facing -x so it covers
// a half-lathe that occupies x >= 0. UVs span the pear's bounding box.
function avocadoFace(def, socket) {
  const prof = avocadoProfileScaled(def);
  const shape = new THREE.Shape();
  prof.forEach(([r, y], i) => (i === 0 ? shape.moveTo(r, y) : shape.lineTo(r, y)));
  for (let i = prof.length - 1; i >= 0; i--) shape.lineTo(-prof[i][0], prof[i][1]);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, 24);
  const rMax = Math.max(...prof.map(p => p[0]));
  const ys = prof.map(p => p[1]);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + rMax) / (2 * rMax), (pos.getY(i) - yMin) / (yMax - yMin));
  }
  const face = mesh(geo, texMat(T.faceAvocado(def, prof, socket), 0.62));
  face.rotation.y = -Math.PI / 2; // face -x
  face.position.x = -0.003;
  return face;
}

// --- fruit builders ----------------------------------------------------------

const builders = {
  watermelon: {
    whole(def) {
      const g = new THREE.Group();
      const body = sphere(def.radius, texMat(T.skinWatermelon(def)));
      body.scale.y = 1.22;
      g.add(body);
      const s = stem(0x5a3d20, 0.22, 0.05, 0.075);
      s.position.y = def.radius * 1.2;
      s.rotation.z = 0.35;
      g.add(s);
      return g;
    },
    halves(def) {
      return sphereHalves(def.radius, texMat(T.skinWatermelon(def)), T.faceWatermelon(def), 1.22);
    },
  },

  orange: {
    whole(def) {
      const g = new THREE.Group();
      g.add(sphere(def.radius, texMat(T.skinCitrus(def))));
      const s = stem(0x7a5a2a, 0.12, 0.06, 0.08);
      s.position.y = def.radius * 0.95;
      g.add(s);
      const lf = leaf(0x3aab52, 0.36);
      lf.position.set(0.16, def.radius * 1.0, 0.04);
      lf.rotation.z = -0.45;
      g.add(lf);
      // navel
      const navel = mesh(new THREE.CircleGeometry(0.07, 16), 0xd9731a);
      navel.rotation.x = Math.PI / 2;
      navel.position.y = -def.radius + 0.004;
      g.add(navel);
      return g;
    },
    halves(def) {
      return sphereHalves(def.radius, texMat(T.skinCitrus(def)), T.faceCitrus(def, 10));
    },
  },

  apple: {
    whole(def) {
      const g = new THREE.Group();
      const body = sphere(def.radius, def.skin);
      body.scale.y = 0.94;
      g.add(body);
      // stem dimple
      const dimple = mesh(new THREE.CircleGeometry(0.2, 24), 0x9e1f1f);
      dimple.rotation.x = -Math.PI / 2;
      dimple.position.y = def.radius * 0.94 - 0.03;
      g.add(dimple);
      const s = stem(0x5a3d20, 0.32, 0.035, 0.055);
      s.position.y = def.radius * 0.94 - 0.06;
      s.rotation.z = 0.18;
      g.add(s);
      const lf = leaf(0x37b24d, 0.4);
      lf.position.set(0.2, def.radius * 0.94 + 0.1, 0);
      lf.rotation.z = -0.55;
      g.add(lf);
      const calyx = mesh(new THREE.CircleGeometry(0.05, 12), 0x4a2a12);
      calyx.rotation.x = Math.PI / 2;
      calyx.position.y = -def.radius * 0.94 + 0.004;
      g.add(calyx);
      return g;
    },
    halves(def) {
      return sphereHalves(def.radius, fruitMat(def.skin), T.faceApple(def), 0.94);
    },
  },

  banana: {
    whole(def) {
      const g = new THREE.Group();
      g.add(mesh(bananaGeometry(def, 0, 1), texMat(T.skinBanana(), 0.55)));
      const curve = bananaCurve(def);
      // stalk on one end, dark nub on the other
      const stalk = mesh(new THREE.CylinderGeometry(0.05, 0.075, def.radius * 0.36, 10), 0x6b5a2a);
      const end = curve.getPoint(1);
      const tan = curve.getTangent(1);
      stalk.position.copy(end).addScaledVector(tan, def.radius * 0.12);
      stalk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
      g.add(stalk);
      const nub = mesh(new THREE.SphereGeometry(def.radius * 0.06, 10, 8), 0x3e2a14);
      nub.position.copy(curve.getPoint(0));
      g.add(nub);
      return g;
    },
    halves(def) {
      const curve = bananaCurve(def);
      const mid = curve.getPoint(0.5);
      const capR = bananaRadius(def, 0.5) * 1.05;
      const skin = texMat(T.skinBanana(), 0.55);
      const face = T.faceBanana(def);

      const right = new THREE.Group(); // occupies x > 0
      right.add(mesh(bananaGeometry(def, 0.5, 1), skin));
      const capA = mesh(new THREE.CircleGeometry(capR, 32), texMat(face, 0.62));
      capA.rotation.y = -Math.PI / 2; // face -x, covering the cut
      capA.position.copy(mid);
      right.add(capA);

      const left = new THREE.Group(); // occupies x < 0
      left.add(mesh(bananaGeometry(def, 0, 0.5), skin));
      const capB = mesh(new THREE.CircleGeometry(capR, 32), texMat(face, 0.62));
      capB.rotation.y = Math.PI / 2; // face +x
      capB.position.copy(mid);
      left.add(capB);

      return { a: right, b: left, axis: new THREE.Vector3(1, 0, 0) };
    },
  },

  pineapple: {
    whole(def) {
      const g = new THREE.Group();
      g.add(mesh(lathe(PINE_PROFILE, def.radius, { yScale: 1.1 }), texMat(T.skinPineapple(def), 0.6)));
      g.add(pineappleCrown(def));
      return g;
    },
    halves(def) {
      const skin = texMat(T.skinPineapple(def), 0.6);
      const capR = PINE_PROFILE[PINE_CUT][0] * def.radius;
      const face = T.facePineapple(def);

      const top = new THREE.Group();
      top.add(mesh(lathe(PINE_PROFILE, def.radius, { slice: [PINE_CUT, PINE_PROFILE.length - 1], yScale: 1.1 }), skin));
      top.add(pineappleCrown(def));
      const capT = mesh(new THREE.CircleGeometry(capR, 48), texMat(face, 0.62));
      capT.rotation.x = Math.PI / 2; // face -y
      top.add(capT);

      const bottom = new THREE.Group();
      bottom.add(mesh(lathe(PINE_PROFILE, def.radius, { slice: [0, PINE_CUT], yScale: 1.1 }), skin));
      const capB = mesh(new THREE.CircleGeometry(capR, 48), texMat(face, 0.62));
      capB.rotation.x = -Math.PI / 2; // face +y
      bottom.add(capB);

      return { a: top, b: bottom, axis: new THREE.Vector3(0, 1, 0) };
    },
  },

  lemon: {
    whole(def) {
      const g = new THREE.Group();
      const body = sphere(def.radius, texMat(T.skinCitrus(def)));
      body.scale.set(0.85, 1.25, 0.85);
      g.add(body);
      // the two little pointed nubs
      for (const dir of [1, -1]) {
        const nub = mesh(new THREE.SphereGeometry(def.radius * 0.28, 20, 14), texMat(T.skinCitrus(def)));
        nub.position.y = dir * def.radius * 1.18;
        nub.scale.set(0.7, 1.1, 0.7);
        g.add(nub);
      }
      const s = stem(0x5c8038, 0.1, 0.035, 0.05);
      s.position.y = def.radius * 1.42;
      g.add(s);
      return g;
    },
    halves(def) {
      return sphereHalves(def.radius * 0.92, texMat(T.skinCitrus(def)), T.faceCitrus(def, 9), 1.2);
    },
  },

  passionfruit: {
    whole(def) {
      const g = new THREE.Group();
      g.add(sphere(def.radius, def.skin));
      const s = stem(0x5c8038, 0.16, 0.04, 0.06);
      s.position.y = def.radius * 0.94;
      g.add(s);
      // tiny three-leaf calyx around the stem
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        const sepal = mesh(new THREE.SphereGeometry(0.07, 12, 8), 0x4c7a2f);
        sepal.scale.set(1.6, 0.4, 0.8);
        sepal.position.set(Math.cos(a) * 0.1, def.radius * 0.96, Math.sin(a) * 0.1);
        sepal.rotation.y = -a;
        g.add(sepal);
      }
      return g;
    },
    halves(def) {
      return sphereHalves(def.radius, fruitMat(def.skin), T.facePassionfruit(def));
    },
  },

  pomegranate: {
    whole(def) {
      const g = new THREE.Group();
      g.add(sphere(def.radius, def.skin));
      // flared calyx crown with pointed sepals
      const throat = mesh(new THREE.CylinderGeometry(0.19, 0.13, 0.22, 16, 1, true), def.skin);
      throat.material = new THREE.MeshStandardMaterial({ color: def.skin, roughness: 0.45, side: THREE.DoubleSide });
      throat.position.y = def.radius * 0.96 + 0.1;
      g.add(throat);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const sepal = mesh(new THREE.ConeGeometry(0.06, 0.26, 8), 0xa61e33);
        sepal.position.set(Math.cos(a) * 0.17, def.radius * 0.96 + 0.3, Math.sin(a) * 0.17);
        sepal.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
        g.add(sepal);
      }
      return g;
    },
    halves(def) {
      return sphereHalves(def.radius, fruitMat(def.skin), T.facePomegranate(def));
    },
  },

  avocado: {
    whole(def) {
      const g = new THREE.Group();
      g.add(mesh(lathe(AVO_PROFILE, def.radius), texMat(T.skinAvocado(def), 0.7)));
      const s = stem(0x4a3521, 0.14, 0.035, 0.05);
      s.position.y = def.radius * 1.02;
      g.add(s);
      return g;
    },
    halves(def) {
      // Cut lengthwise: half-lathes occupying x >= 0 (a) and x <= 0 (b).
      const skin = texMat(T.skinAvocado(def), 0.7);
      const a = new THREE.Group();
      a.add(mesh(lathe(AVO_PROFILE, def.radius, { phi: [0, Math.PI] }), skin));
      a.add(avocadoFace(def, false));
      // the pit, bulging out of the cut face
      const pit = mesh(new THREE.SphereGeometry(def.radius * 0.42, 28, 20),
        new THREE.MeshStandardMaterial({ color: 0x5b3a1e, roughness: 0.35 }));
      pit.position.set(-0.02, -0.28 * def.radius, 0);
      a.add(pit);

      const b = new THREE.Group();
      const shellB = mesh(lathe(AVO_PROFILE, def.radius, { phi: [Math.PI, Math.PI] }), skin);
      b.add(shellB);
      const faceB = avocadoFace(def, true);
      faceB.rotation.y = Math.PI / 2; // face +x
      faceB.position.x = 0.003;
      b.add(faceB);

      return { a, b, axis: new THREE.Vector3(1, 0, 0) };
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
  g.add(sphere(0.55, 0x1f1f27));
  const neck = mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.18, 14), 0x3a3a46);
  neck.position.y = 0.55;
  g.add(neck);
  const fuse = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), 0xc9a227);
  fuse.position.y = 0.78;
  fuse.rotation.z = 0.4;
  g.add(fuse);
  return g;
}
