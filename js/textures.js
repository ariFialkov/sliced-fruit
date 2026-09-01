// ============================================================================
// Procedurally painted cartoon textures. Everything is drawn once to a canvas
// and cached, so the fruit stays crisp at any size with no image assets.
//
//   skin*  — wrap around the whole fruit (sphere / lathe / sweep UVs)
//   face*  — the flat cut face of a halved fruit (disc UVs, 0..1 square)
// ============================================================================

import * as THREE from '../lib/three.module.min.js';

const cache = new Map();

function css(c) {
  return '#' + c.toString(16).padStart(6, '0');
}

// Deterministic RNG so cached textures are identical run to run.
function mulberry(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function make(key, w, h, paint) {
  let t = cache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  paint(ctx, w, h, mulberry(hash(key)));
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

function disc(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function radial(ctx, cx, cy, r, inner, outer) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  return g;
}

function seed(ctx, cx, cy, rx, ry, rot, fill, shine = true) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (shine) {
    ctx.beginPath();
    ctx.ellipse(-rx * 0.3, -ry * 0.35, rx * 0.28, ry * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
  }
  ctx.restore();
}

// Fine speckle for peel / bumpy skins — subtle enough to read as texture,
// not pattern.
function speckle(ctx, w, h, rnd, count, colors, alpha, rMin, rMax) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    disc(ctx, rnd() * w, rnd() * h, rMin + rnd() * (rMax - rMin), colors[i % colors.length]);
  }
  ctx.globalAlpha = 1;
}

// --- skins -------------------------------------------------------------------

export function skinWatermelon(def) {
  return make('skin-watermelon', 1024, 512, (ctx, w, h, rnd) => {
    ctx.fillStyle = css(def.skin);
    ctx.fillRect(0, 0, w, h);
    const N = 12, cw = w / N, steps = 48;
    ctx.fillStyle = css(def.accent);
    for (let i = 0; i < N; i++) {
      const cx = (i + 0.5) * cw;
      const pa = rnd() * 6.28, pb = rnd() * 6.28, f = 4 + rnd() * 3;
      const edge = (y, phase) => {
        const v = y / h;
        const wave = 0.09 * Math.sin(v * Math.PI * f + phase) + 0.04 * Math.sin(v * Math.PI * f * 2.3 + phase * 1.7);
        // stripes narrow toward the poles so the UV pinch stays clean
        const taper = 0.5 + 0.5 * Math.sin(v * Math.PI);
        return cw * (0.24 + wave) * taper;
      };
      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const y = (s / steps) * h;
        const x = cx + edge(y, pa);
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let s = steps; s >= 0; s--) {
        const y = (s / steps) * h;
        ctx.lineTo(cx - edge(y, pb), y);
      }
      ctx.closePath();
      ctx.fill();
    }
  });
}

// Orange / lemon peel: solid colour with a soft dimple speckle.
export function skinCitrus(def) {
  return make(`skin-citrus-${def.id}`, 512, 512, (ctx, w, h, rnd) => {
    ctx.fillStyle = css(def.skin);
    ctx.fillRect(0, 0, w, h);
    const dark = new THREE.Color(def.skin).multiplyScalar(0.82).getStyle();
    speckle(ctx, w, h, rnd, 1400, [dark], 0.16, 1.4, 3.2);
  });
}

export function skinPineapple(def) {
  return make('skin-pineapple', 512, 512, (ctx, w, h, rnd) => {
    const base = css(def.skin);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    const cols = 8, rows = 7, cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c <= cols; c++) {
        const cx = c * cw + (r % 2 ? cw / 2 : 0) + cw / 2;
        const cy = r * rh + rh / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy - rh / 2);
        ctx.lineTo(cx + cw / 2, cy);
        ctx.lineTo(cx, cy + rh / 2);
        ctx.lineTo(cx - cw / 2, cy);
        ctx.closePath();
        ctx.fillStyle = rnd() < 0.5 ? '#e9ae3e' : '#e2a336';
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#b3741f';
        ctx.lineJoin = 'round';
        ctx.stroke();
        // the little "eye" in each cell
        ctx.beginPath();
        ctx.moveTo(cx, cy - rh * 0.17);
        ctx.lineTo(cx + cw * 0.15, cy);
        ctx.lineTo(cx, cy + rh * 0.17);
        ctx.lineTo(cx - cw * 0.15, cy);
        ctx.closePath();
        ctx.fillStyle = '#8a5416';
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx - cw * 0.05, cy - rh * 0.07, cw * 0.05, rh * 0.035, -0.6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,230,150,0.55)';
        ctx.fill();
      }
    }
  });
}

// Banana skin runs along the fruit: dark tip, green-tinged ends, ripe middle.
export function skinBanana() {
  return make('skin-banana', 512, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0.00, '#5a3d20');
    g.addColorStop(0.035, '#5a3d20');
    g.addColorStop(0.07, '#b9b83a');
    g.addColorStop(0.16, '#ffd93b');
    g.addColorStop(0.82, '#ffdc4a');
    g.addColorStop(0.9, '#cfc73c');
    g.addColorStop(0.955, '#7a5a2a');
    g.addColorStop(1.00, '#5a3d20');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

export function skinAvocado(def) {
  return make('skin-avocado', 512, 512, (ctx, w, h, rnd) => {
    ctx.fillStyle = css(def.skin);
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, rnd, 2600, ['#3f6128', '#22381a'], 0.45, 1, 2.6);
  });
}

// --- cut faces ---------------------------------------------------------------
// Painted in a 512² square; the disc mesh maps the inscribed circle.

const S = 512, C = 256;

export function faceCitrus(def, segments) {
  return make(`face-citrus-${def.id}`, S, S, (ctx) => {
    const pith = css(def.rind);
    disc(ctx, C, C, 256, css(def.skin));
    disc(ctx, C, C, 238, pith);
    const flesh = new THREE.Color(def.flesh);
    const light = flesh.clone().lerp(new THREE.Color(0xffffff), 0.28).getStyle();
    disc(ctx, C, C, 218, radial(ctx, C, C, 218, light, flesh.getStyle()));
    // segment membranes
    ctx.strokeStyle = pith;
    ctx.lineCap = 'round';
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(C, C);
      ctx.lineTo(C + Math.cos(a) * 218, C + Math.sin(a) * 218);
      ctx.stroke();
      // juice-vesicle hints inside each segment
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.22;
      for (const k of [0.33, 0.66]) {
        const b = a + (k * Math.PI * 2) / segments;
        ctx.beginPath();
        ctx.moveTo(C + Math.cos(b) * 60, C + Math.sin(b) * 60);
        ctx.lineTo(C + Math.cos(b) * 205, C + Math.sin(b) * 205);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    disc(ctx, C, C, 16, pith);
  });
}

export function faceWatermelon(def) {
  return make('face-watermelon', S, S, (ctx, w, h, rnd) => {
    disc(ctx, C, C, 256, css(def.skin));
    disc(ctx, C, C, 240, css(def.rind));
    disc(ctx, C, C, 226, radial(ctx, C, C, 226, '#ff8a8a', css(def.flesh)));
    // two rings of seeds pointing at the centre
    for (const [r, n, off] of [[112, 7, 0], [178, 11, 0.3]]) {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + off + (rnd() - 0.5) * 0.18;
        const rr = r + (rnd() - 0.5) * 14;
        seed(ctx, C + Math.cos(a) * rr, C + Math.sin(a) * rr, 8, 13, a + Math.PI / 2, '#1f1f1f');
      }
    }
  });
}

export function faceApple(def) {
  return make('face-apple', S, S, (ctx) => {
    disc(ctx, C, C, 256, css(def.skin));
    disc(ctx, C, C, 246, radial(ctx, C, C, 246, '#fff5dc', '#f2dcae'));
    // five-point core star, softly rounded
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 44 : 74;
      const x = C + Math.cos(a) * r, y = C + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#e7cf9c';
    ctx.stroke();
    ctx.fillStyle = '#e7cf9c';
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      seed(ctx, C + Math.cos(a) * 34, C + Math.sin(a) * 34, 6, 10, a + Math.PI / 2, '#5b3a1e');
    }
  });
}

export function facePassionfruit(def) {
  return make('face-passionfruit', S, S, (ctx, w, h, rnd) => {
    disc(ctx, C, C, 256, css(def.skin));
    disc(ctx, C, C, 238, css(def.rind));
    disc(ctx, C, C, 196, radial(ctx, C, C, 196, '#ffc24d', css(def.flesh)));
    // seeds in glossy pulp sacs
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 172;
      const x = C + Math.cos(a) * r, y = C + Math.sin(a) * r, rot = rnd() * Math.PI;
      seed(ctx, x, y, 21, 16, rot, 'rgba(255,214,120,0.85)', false);
      seed(ctx, x, y, 12, 8.5, rot, css(def.accent));
    }
  });
}

export function facePomegranate(def) {
  return make('face-pomegranate', S, S, (ctx, w, h, rnd) => {
    const pith = css(def.rind);
    disc(ctx, C, C, 256, css(def.skin));
    disc(ctx, C, C, 240, pith);
    // hex-packed arils
    const sp = 31;
    for (let row = -8; row <= 8; row++) {
      for (let col = -8; col <= 8; col++) {
        const x = C + col * sp + (row % 2 ? sp / 2 : 0);
        const y = C + row * sp * 0.87;
        if (Math.hypot(x - C, y - C) > 222) continue;
        disc(ctx, x, y, 13.5, css(def.flesh));
        disc(ctx, x - 4, y - 4, 4.5, 'rgba(255,255,255,0.45)');
      }
    }
    // membranes dividing the chambers
    ctx.strokeStyle = pith;
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const bend = (rnd() - 0.5) * 0.6;
      ctx.beginPath();
      ctx.moveTo(C, C);
      ctx.quadraticCurveTo(
        C + Math.cos(a + bend) * 130, C + Math.sin(a + bend) * 130,
        C + Math.cos(a) * 240, C + Math.sin(a) * 240,
      );
      ctx.stroke();
    }
    disc(ctx, C, C, 22, pith);
  });
}

export function faceBanana(def) {
  return make('face-banana', S, S, (ctx) => {
    disc(ctx, C, C, 256, radial(ctx, C, C, 256, '#fff8d6', css(def.flesh)));
    ctx.strokeStyle = 'rgba(160,130,60,0.28)';
    ctx.lineWidth = 6;
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(C, C);
      ctx.lineTo(C + Math.cos(a) * 240, C + Math.sin(a) * 240);
      ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 6 + (i / 3) * Math.PI * 2;
      disc(ctx, C + Math.cos(a) * 26, C + Math.sin(a) * 26, 7, '#5a4a2a');
    }
  });
}

export function facePineapple(def) {
  return make('face-pineapple', S, S, (ctx) => {
    disc(ctx, C, C, 256, '#c98a24');
    disc(ctx, C, C, 238, radial(ctx, C, C, 238, '#ffe680', css(def.flesh)));
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(C + Math.cos(a) * 58, C + Math.sin(a) * 58);
      ctx.lineTo(C + Math.cos(a) * 236, C + Math.sin(a) * 236);
      ctx.stroke();
    }
    disc(ctx, C, C, 50, '#fff1a8');
    ctx.beginPath();
    ctx.arc(C, C, 50, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(190,140,40,0.35)';
    ctx.stroke();
  });
}

// Avocado halves are cut lengthwise, so the face is pear-shaped. `profile`
// is the lathe profile as [r, y] pairs (already scaled); we paint in the
// pear's bounding box so the mesh UVs (0..1 across that box) line up.
export function faceAvocado(def, profile, socket) {
  return make(`face-avocado-${socket ? 'socket' : 'pit'}`, S, S, (ctx) => {
    const rMax = Math.max(...profile.map(p => p[0]));
    const ys = profile.map(p => p[1]);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const X = r => (0.5 + r / (2 * rMax)) * S;
    const Y = y => (1 - (y - yMin) / (yMax - yMin)) * S;

    const pear = (scale) => {
      ctx.beginPath();
      profile.forEach(([r, y], i) => {
        const px = X(r * scale), py = Y(y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      for (let i = profile.length - 1; i >= 0; i--) ctx.lineTo(X(-profile[i][0] * scale), Y(profile[i][1]));
      ctx.closePath();
    };

    ctx.fillStyle = css(def.skin);
    ctx.fillRect(0, 0, S, S);
    pear(1);
    ctx.fill();
    pear(0.93);
    const cy = Y(-0.28 * def.radius);
    ctx.fillStyle = radial(ctx, C, cy, 300, '#e3e9a4', '#86ad4b');
    ctx.fill();

    // where the pit sits
    const rx = (0.42 * def.radius) / (2 * rMax) * S;
    const ry = (0.42 * def.radius) / (yMax - yMin) * S;
    ctx.beginPath();
    ctx.ellipse(C, cy, rx, ry, 0, 0, Math.PI * 2);
    if (socket) {
      const g = ctx.createRadialGradient(C - rx * 0.25, cy - ry * 0.3, 0, C, cy, rx);
      g.addColorStop(0, '#8b8a4a');
      g.addColorStop(1, '#4e4b25');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = '#b9c27a';
    }
    ctx.fill();
  });
}
