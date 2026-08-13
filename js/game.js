// ============================================================================
// Game engine: Three.js scene, fruit lifecycle, swipe slicing, betting flow,
// and the 60-second round loop. UI concerns stay in ui.js — the game reports
// state through the callbacks passed to the constructor:
//   onHud(state)        — balance / timer / round total changed
//   onRoundEnd(summary) — round finished
//   onBomb()            — a disguised bomb went off (for screen shake/vignette)
//   onInsufficient()    — swipe rejected because balance can't cover the bet
// ============================================================================

import * as THREE from '../lib/three.module.min.js';
import { CONFIG } from './config.js';
import { prepareConfig, RoundDirector, rand, pickWeighted } from './rng.js';
import { buildWhole, buildHalves, applyGoldSkin, applyGlow } from './fruits.js';
import { EffectSystem, GoldAura } from './effects.js';
import { Blender } from './blender.js';
import { PrizeLabel } from './labels.js';
import { sfxSlice, sfxSplat, sfxBoom, sfxWin, sfxGolden, sfxFrenzy, unlockAudio } from './sfx.js';

const SKY_DAY = ['#6fbdea', '#9ed9f5', '#d6f1fc'];
const SKY_FRENZY = ['#141033', '#251a4d', '#3a2b66'];

function lerpHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (sh) => Math.round(((pa >> sh) & 255) + (((pb >> sh) & 255) - ((pa >> sh) & 255)) * t);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

const BALANCE_KEY = 'sliced-fruit-balance';

export class Game {
  constructor({ container, sceneCanvas, trailCanvas, callbacks }) {
    this.cfg = prepareConfig(CONFIG);
    this.cb = callbacks;
    this.container = container;
    this.trailCanvas = trailCanvas;
    this.trailCtx = trailCanvas.getContext('2d');

    const saved = parseFloat(localStorage.getItem(BALANCE_KEY));
    this.balance = Number.isFinite(saved) ? saved : this.cfg.startingBalance;

    this.selectedBet = this.cfg.defaultBet;
    this.mode = 'ambient'; // ambient | countdown | playing
    this.elapsed = 0;
    this.spawnTimer = 1;
    this.fruits = [];
    this.deadLabels = [];
    this.trail = [];
    this.pointerDown = false;
    this.shake = 0;
    this.frenzy = { scheduledAt: null, active: false, until: 0, mix: 0 };

    this.director = new RoundDirector(this.cfg);

    this.initScene(sceneCanvas);
    this.effects = new EffectSystem(this.scene);
    this.blender = this.cfg.blender.enabled ? new Blender(this.scene, this.cfg.blender) : null;
    this.bindPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // -- scene ------------------------------------------------------------------

  initScene(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new THREE.Scene();
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 2;
    this.skyCanvas.height = 512;
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.skyTex;
    this.paintSky(0);

    this.camDist = 15;
    this.camY = 2.6;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
    this.camera.position.set(0, this.camY, this.camDist);
    this.camera.lookAt(0, this.camY, 0);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xa8c8dd, 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.3);
    this.sun.position.set(5, 10, 7);
    this.scene.add(this.sun);
    this.fill = new THREE.DirectionalLight(0xfff3d6, 0.55);
    this.fill.position.set(-6, 2, 8);
    this.scene.add(this.fill);
  }

  // mix 0 = day, 1 = frenzy night. Repaints the sky gradient and dims lights.
  paintSky(mix) {
    const ctx = this.skyCanvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    SKY_DAY.forEach((day, i) => {
      g.addColorStop([0, 0.55, 1][i], lerpHex(day, SKY_FRENZY[i], mix));
    });
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 512);
    this.skyTex.needsUpdate = true;
    if (this.hemi) {
      this.hemi.intensity = THREE.MathUtils.lerp(1.35, 0.5, mix);
      this.sun.intensity = THREE.MathUtils.lerp(2.3, 0.85, mix);
      this.fill.intensity = THREE.MathUtils.lerp(0.55, 0.15, mix);
    }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.trailCanvas.width = w * dpr;
    this.trailCanvas.height = h * dpr;
    this.trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // frustum extents at z = 0 (the fruit plane)
    this.halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camDist;
    this.halfW = this.halfH * this.camera.aspect;
    if (this.blender) {
      this.blender.group.position.y = this.camY - this.halfH + this.cfg.blender.rimOffset;
    }
  }

  worldToScreen(pos) {
    const v = pos.clone().project(this.camera);
    return {
      x: (v.x + 1) / 2 * this.container.clientWidth,
      y: (1 - v.y) / 2 * this.container.clientHeight,
    };
  }

  screenRadius(worldR, z) {
    const dist = this.camDist - z;
    return worldR * (this.container.clientHeight / 2) /
      (Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist);
  }

  // -- betting helpers --------------------------------------------------------

  setBet(amount) {
    this.selectedBet = amount;
    this.pushHud();
  }

  get activeBet() {
    return this.mode === 'playing' ? this.director.bet : this.selectedBet;
  }

  // Baseline currency value of one slice of this fruit, used by the rolling
  // labels (the director computes the real thing identically at slice time).
  shareFor(def) {
    return (this.activeBet / this.cfg.director.expectedSlices) * def.valueFactor;
  }

  saveBalance() {
    localStorage.setItem(BALANCE_KEY, String(this.balance));
  }

  addFunds(amount) {
    this.balance += amount;
    this.saveBalance();
    this.pushHud();
  }

  pushHud() {
    this.cb.onHud?.({
      balance: this.balance,
      total: this.director.runningTotal,
      timeLeft: this.mode === 'playing' ? Math.max(0, this.cfg.roundSeconds - this.elapsed) : this.cfg.roundSeconds,
      bet: this.activeBet,
      mode: this.mode,
    });
  }

  // -- round flow -------------------------------------------------------------

  beginCountdown() {
    this.mode = 'countdown';
    this.pushHud();
  }

  // The bet is debited once, up front, when the round begins.
  startRound() {
    const bet = this.selectedBet;
    if (this.balance < bet) return false;
    this.balance -= bet;
    this.saveBalance();
    this.mode = 'playing';
    this.elapsed = 0;
    this.spawnTimer = 0.4;
    this.director.startRound(bet);
    this.blender?.reset();

    // Maybe schedule this round's frenzy window.
    const fz = this.cfg.frenzy;
    this.frenzy.active = false;
    this.frenzy.scheduledAt =
      Math.random() < fz.chance
        ? rand(fz.earliestStart, this.cfg.roundSeconds - fz.duration - fz.latestEndMargin)
        : null;

    this.pushHud();
    return true;
  }

  setFrenzy(on) {
    this.frenzy.active = on;
    if (on) {
      this.frenzy.until = this.elapsed + this.cfg.frenzy.duration;
      sfxFrenzy();
    }
    this.cb.onFrenzy?.(on);
  }

  endRound() {
    if (this.frenzy.active) this.setFrenzy(false);
    this.frenzy.scheduledAt = null;
    const total = this.director.runningTotal;
    const payout = this.cfg.floorPayout ? Math.max(0, total) : total;
    this.balance += payout;
    this.saveBalance();
    this.mode = 'ambient';
    this.pushHud();
    this.cb.onRoundEnd?.({
      bet: this.director.bet,
      total,
      payout,
      net: payout - this.director.bet,
      balance: this.balance,
    });
  }

  // -- fruit lifecycle --------------------------------------------------------

  spawnFruit() {
    const def = pickWeighted(this.cfg.fruits, f => f.weight);
    const group = buildWhole(def);

    // Rare golden bonus fruit — never in the final seconds of a round, so the
    // director has time to re-balance after the multiplier lands.
    const gd = this.cfg.golden;
    const goldenAllowed =
      this.mode !== 'playing' ||
      this.elapsed < this.cfg.roundSeconds - gd.cutoffSeconds;
    const golden = goldenAllowed && Math.random() < gd.chance;

    if (golden) applyGoldSkin(group);
    else if (this.frenzy.active) applyGlow(group);

    const x = rand(-this.halfW * 0.65, this.halfW * 0.65);
    const bottom = this.camY - this.halfH;
    group.position.set(x, bottom - 1.5, rand(-0.8, 0.8));
    this.scene.add(group);

    // Radiating aura so the bonus item reads as special at a glance. Kept as
    // a sibling of the fruit (position-synced each frame) so the fruit's spin
    // doesn't tumble the sparkle orbits.
    let aura = null;
    if (golden) {
      aura = new GoldAura(def.radius);
      aura.group.position.copy(group.position);
      this.scene.add(aura.group);
    }

    const ph = this.cfg.physics;
    const fruit = {
      def, group, golden, aura,
      vel: new THREE.Vector3(
        -x * rand(0.06, 0.22) + rand(-ph.driftX, ph.driftX) * 0.4,
        rand(ph.launchYMin, ph.launchYMax),
        0,
      ),
      angVel: new THREE.Vector3(rand(-ph.spin, ph.spin), rand(-ph.spin, ph.spin), rand(-ph.spin, ph.spin)),
      label: golden
        ? new PrizeLabel(
            this.scene,
            () => gd.multipliers.map(e => e.m),
            m => `×${m}`,
            { golden: true },
          )
        : new PrizeLabel(
            this.scene,
            () => def.paytable.map(e => e.mult * this.shareFor(def)),
            v => this.cb.formatMoney(v),
          ),
      sliced: false,
    };
    this.fruits.push(fruit);
  }

  removeFruit(fruit, keepLabel) {
    this.scene.remove(fruit.group);
    if (fruit.aura) {
      this.scene.remove(fruit.aura.group);
      fruit.aura.dispose();
    }
    if (keepLabel) this.deadLabels.push(fruit.label);
    else fruit.label.dispose();
    const i = this.fruits.indexOf(fruit);
    if (i >= 0) this.fruits.splice(i, 1);
  }

  updateSpawning(dt) {
    const s = this.cfg.spawn;
    const fz = this.cfg.frenzy;
    const ambient = this.mode !== 'playing';
    let max = ambient ? s.ambientMaxConcurrent : s.maxConcurrent;
    if (this.frenzy.active) max = fz.maxConcurrent;
    if (this.mode === 'countdown') return;

    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || this.fruits.length >= max) return;

    let batch;
    if (ambient) {
      batch = 1 + Math.floor(rand(0, s.ambientBatch));
      this.spawnTimer = s.ambientInterval * rand(0.7, 1.3);
    } else {
      const p = this.elapsed / this.cfg.roundSeconds;
      batch = Math.round(rand(s.minBatch, s.minBatch + (s.maxBatch - s.minBatch) * p));
      this.spawnTimer = THREE.MathUtils.lerp(s.startInterval, s.endInterval, p) * rand(0.75, 1.25);
      if (this.frenzy.active) {
        batch += fz.extraBatch;
        this.spawnTimer *= fz.spawnIntervalScale;
      }
    }
    for (let i = 0; i < batch && this.fruits.length < max; i++) this.spawnFruit();
  }

  updateFruits(dt) {
    const g = this.cfg.physics.gravity;
    const bottom = this.camY - this.halfH;
    const labelPos = new THREE.Vector3();
    const rimY = this.blender ? this.blender.group.position.y : -Infinity;
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const f = this.fruits[i];
      const prevY = f.group.position.y;
      f.vel.y -= g * dt;
      f.group.position.addScaledVector(f.vel, dt);

      // Falling into the blender mouth?
      if (this.blender && f.vel.y < 0 && prevY >= rimY && f.group.position.y < rimY &&
          Math.abs(f.group.position.x - this.blender.x) <= this.cfg.blender.radius &&
          this.blender.cooldown <= 0) {
        if (this.blenderCatch(f)) continue;
      }

      f.group.rotation.x += f.angVel.x * dt;
      f.group.rotation.y += f.angVel.y * dt;
      f.group.rotation.z += f.angVel.z * dt;
      if (f.aura) {
        f.aura.group.position.copy(f.group.position);
        f.aura.update(dt);
      }
      labelPos.copy(f.group.position);
      labelPos.y += f.def.radius + 1.1;
      f.label.update(dt, labelPos);
      if (f.vel.y < 0 && f.group.position.y < bottom - 2) {
        this.removeFruit(f, false); // missed — no bet, no result
      }
    }
    for (let i = this.deadLabels.length - 1; i >= 0; i--) {
      const l = this.deadLabels[i];
      l.update(dt, null);
      if (l.done) {
        l.dispose();
        this.deadLabels.splice(i, 1);
      }
    }
  }

  // -- blender ----------------------------------------------------------------

  updateBlender(dt) {
    const b = this.blender;
    if (!b) return;
    const cfg = this.cfg.blender;
    b.cooldown = Math.max(0, b.cooldown - dt);

    let huntX = null;
    if (this.mode === 'playing') {
      const d = this.director;
      // How far the total has drifted from the pace it should be keeping.
      const p = Math.min(1, this.elapsed / this.cfg.roundSeconds);
      const offPace = d.targetTotal * p - d.runningTotal;
      const gap = d.targetTotal - d.runningTotal;
      const hungry =
        Math.abs(offPace) > d.share * cfg.hungerThreshold ||
        (d.remaining <= cfg.lateSeconds && Math.abs(gap) > d.share * cfg.lateThreshold);
      if (hungry) huntX = this.predictCatchX(gap);
    }
    b.update(dt, { halfW: this.halfW, huntX });
  }

  // Where should the blender stand to swallow the soonest reachable fruit?
  // `gap` < 0 means the total is running hot, so goldens are left alone.
  predictCatchX(gap) {
    const g = this.cfg.physics.gravity;
    const rimY = this.blender.group.position.y;
    const reach = this.cfg.blender.huntSpeed;
    let best = null;
    for (const f of this.fruits) {
      if (f.sliced) continue;
      if (f.golden && gap < 0) continue;
      const py = f.group.position.y, vy = f.vel.y;
      const disc = vy * vy + 2 * g * (py - rimY);
      if (disc < 0) continue;                 // never comes back down to the rim
      const t = (vy + Math.sqrt(disc)) / g;   // time until it crosses, descending
      if (t <= 0.05) continue;
      const x = f.group.position.x + f.vel.x * t;
      if (Math.abs(x) > this.halfW) continue;
      if (Math.abs(x - this.blender.x) > reach * t) continue; // can't get there in time
      if (!best || t < best.t) best = { t, x };
    }
    return best ? best.x : null;
  }

  // Returns true if the fruit was consumed.
  blenderCatch(f) {
    const b = this.blender;
    const pos = b.mouth();

    // Menu attract loop: purely decorative, no betting values involved.
    if (this.mode !== 'playing') {
      if (Math.random() > this.cfg.blender.ambientCatchChance) return false;
      b.cooldown = this.cfg.blender.catchCooldown;
      b.absorb(f.def.flesh);
      this.effects.juiceBurst(pos, f.def.flesh, 10, 4.5);
      sfxSplat(rand(0.8, 1.2));
      this.removeFruit(f, false);
      return true;
    }

    b.cooldown = this.cfg.blender.catchCooldown;

    if (f.golden) {
      const m = pickWeighted(this.cfg.golden.multipliers, e => e.w).m;
      this.director.applyGolden(m);
      b.absorb(0xffd700);
      this.effects.juiceBurst(pos, 0xffd700, 16, 6);
      this.effects.juiceBurst(pos, 0xfff3bf, 8, 4);
      sfxGolden();
      f.label.land(0, `×${m}!`);
    } else {
      const result = this.director.onSlice(f.def);
      if (result.value < 0) {
        // A disguised bomb going off inside the blender.
        b.absorb(0x4a4a55);
        this.effects.bombExplosion(pos, new THREE.Vector3(0, 2.5, 0));
        this.shake = 0.4;
        this.cb.onBomb?.();
        sfxBoom();
      } else {
        b.absorb(f.def.flesh);
        this.effects.juiceBurst(pos, f.def.flesh, 12, 5);
        sfxSplat(rand(0.8, 1.2));
      }
      f.label.land(result.value);
    }

    // float the result up out of the blender mouth
    f.label.sprite.position.set(pos.x, pos.y + 1.0, 0);
    this.removeFruit(f, true);
    this.pushHud();
    return true;
  }

  // -- slicing ----------------------------------------------------------------

  bindPointer() {
    const el = this.container;
    el.addEventListener('pointerdown', (e) => {
      unlockAudio();
      this.pointerDown = true;
      this.trail.length = 0;
      this.trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.pointerDown) return;
      const now = performance.now();
      const prev = this.trail[this.trail.length - 1];
      const p = { x: e.clientX, y: e.clientY, t: now };
      this.trail.push(p);
      if (this.trail.length > 40) this.trail.shift();
      if (this.mode !== 'playing' || !prev) return;
      const dx = p.x - prev.x, dy = p.y - prev.y;
      const len = Math.hypot(dx, dy);
      const speed = len / Math.max(1, now - prev.t);
      if (len < 3 || speed < this.cfg.swipe.minSpeed) return;
      this.trySlice(prev, p, dx, dy);
    });
    const up = () => { this.pointerDown = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  trySlice(a, b, dx, dy) {
    let hitAny = false;
    for (const f of [...this.fruits]) {
      if (f.sliced) continue;
      const s = this.worldToScreen(f.group.position);
      const r = this.screenRadius(f.def.radius, f.group.position.z) + this.cfg.swipe.pad;
      if (distPointSegment(s.x, s.y, a.x, a.y, b.x, b.y) <= r) {
        this.sliceFruit(f, dx, dy);
        hitAny = true;
      }
    }
    if (hitAny) sfxSlice();
  }

  sliceFruit(f, dx, dy) {
    f.sliced = true;

    // Orient the cut from the swipe: halves separate perpendicular to the
    // swipe direction, tilted a little toward the camera so the flesh shows.
    const swipe = new THREE.Vector3(dx, -dy, 0).normalize();
    const sep = new THREE.Vector3(-swipe.y, swipe.x, 0).add(new THREE.Vector3(0, 0, 0.7)).normalize();
    const pos = f.group.position.clone();

    if (f.golden) {
      // Bonus fruit: multiplies the round total, always a celebration.
      const m = pickWeighted(this.cfg.golden.multipliers, e => e.w).m;
      this.director.applyGolden(m);
      const pieces = buildHalves(f.def);
      applyGoldSkin(pieces.a);
      applyGoldSkin(pieces.b);
      const quat = new THREE.Quaternion().setFromUnitVectors(pieces.axis, sep);
      this.effects.halves(pos, f.vel.clone(), pieces, quat, sep);
      this.effects.juiceBurst(pos, 0xffd700, 18, 8);
      this.effects.juiceBurst(pos, 0xfff3bf, 10, 5);
      sfxGolden();
      f.label.land(0, `×${m}!`);
      this.removeFruit(f, true);
      this.pushHud();
      return;
    }

    const result = this.director.onSlice(f.def);
    if (result.value < 0) {
      // Disguised bomb — small explosion instead of a juicy split.
      this.effects.bombExplosion(pos, f.vel);
      this.shake = 0.45;
      this.cb.onBomb?.();
      sfxBoom();
    } else {
      const pieces = buildHalves(f.def);
      const quat = new THREE.Quaternion().setFromUnitVectors(pieces.axis, sep);
      this.effects.halves(pos, f.vel.clone(), pieces, quat, sep);
      this.effects.juiceBurst(pos, f.def.flesh, 14, 6);
      this.effects.splat(pos, f.def.flesh);
      sfxSplat(rand(0.85, 1.2));
      if (result.mult >= 4) sfxWin();
    }

    f.label.land(result.value);
    this.removeFruit(f, true);
    this.pushHud();
  }

  // -- trail rendering --------------------------------------------------------

  drawTrail() {
    const ctx = this.trailCtx;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const now = performance.now();
    const maxAge = this.cfg.swipe.trailMs;
    const pts = this.trail.filter(p => now - p.t < maxAge);
    if (pts.length < 2 || !this.pointerDown) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) {
      const age = (now - pts[i].t) / maxAge;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      // dark underlay keeps the blade visible against the bright sky
      ctx.strokeStyle = `rgba(18,60,96,${(1 - age) * 0.45})`;
      ctx.lineWidth = 6 + (1 - age) * 12;
      ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${(1 - age) * 0.95})`;
      ctx.lineWidth = 3 + (1 - age) * 9;
      ctx.stroke();
    }
  }

  // -- main loop --------------------------------------------------------------

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if (this.mode === 'playing') {
      this.elapsed += dt;
      this.director.tick(this.elapsed);

      // frenzy window
      if (this.frenzy.scheduledAt !== null && !this.frenzy.active && this.elapsed >= this.frenzy.scheduledAt) {
        this.frenzy.scheduledAt = null;
        this.setFrenzy(true);
      }
      if (this.frenzy.active && this.elapsed >= this.frenzy.until) this.setFrenzy(false);

      this.pushHud();
      if (this.elapsed >= this.cfg.roundSeconds) this.endRound();
    }

    // ease the sky between day and frenzy night
    const targetMix = this.frenzy.active ? 1 : 0;
    if (Math.abs(this.frenzy.mix - targetMix) > 0.001) {
      const step = dt * 1.6;
      this.frenzy.mix += Math.sign(targetMix - this.frenzy.mix) * Math.min(step, Math.abs(targetMix - this.frenzy.mix));
      this.paintSky(this.frenzy.mix);
    }

    this.updateSpawning(dt);
    this.updateBlender(dt);
    this.updateFruits(dt);
    this.effects.update(dt, this.cfg.physics.gravity);
    this.drawTrail();

    // camera shake after bombs
    if (this.shake > 0.001) {
      this.shake *= Math.pow(0.0005, dt);
      this.camera.position.x = rand(-1, 1) * this.shake;
      this.camera.position.y = this.camY + rand(-1, 1) * this.shake;
    } else {
      this.camera.position.x = 0;
      this.camera.position.y = this.camY;
    }

    this.renderer.render(this.scene, this.camera);
  }
}

function distPointSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / lenSq));
  const cx = ax + abx * t, cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}
