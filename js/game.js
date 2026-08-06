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
import { buildWhole, buildHalves } from './fruits.js';
import { EffectSystem } from './effects.js';
import { PrizeLabel } from './labels.js';
import { sfxSlice, sfxSplat, sfxBoom, sfxWin, unlockAudio } from './sfx.js';

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

    this.stakeIndex = 0;
    this.mode = 'ambient'; // ambient | countdown | playing
    this.elapsed = 0;
    this.spawnTimer = 1;
    this.fruits = [];
    this.deadLabels = [];
    this.trail = [];
    this.pointerDown = false;
    this.shake = 0;
    this.insufficientCooldown = 0;

    this.director = new RoundDirector(this.cfg);

    this.initScene(sceneCanvas);
    this.effects = new EffectSystem(this.scene);
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
    this.scene.background = this.makeBackdrop();

    this.camDist = 15;
    this.camY = 2.6;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 60);
    this.camera.position.set(0, this.camY, this.camDist);
    this.camera.lookAt(0, this.camY, 0);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xa8c8dd, 1.35));
    const sun = new THREE.DirectionalLight(0xffffff, 2.3);
    sun.position.set(5, 10, 7);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xfff3d6, 0.55);
    fill.position.set(-6, 2, 8);
    this.scene.add(fill);
  }

  makeBackdrop() {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#6fbdea');
    g.addColorStop(0.55, '#9ed9f5');
    g.addColorStop(1, '#d6f1fc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
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

  get stakeMultiplier() { return this.cfg.stakeMultipliers[this.stakeIndex]; }

  setStakeIndex(i) {
    this.stakeIndex = i;
    this.pushHud();
  }

  betFor(def) {
    return this.cfg.baseStake * this.stakeMultiplier * def.stakeFactor;
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
      stakeMultiplier: this.stakeMultiplier,
      baseStake: this.cfg.baseStake,
      mode: this.mode,
    });
  }

  // -- round flow -------------------------------------------------------------

  beginCountdown() {
    this.mode = 'countdown';
    this.pushHud();
  }

  startRound() {
    this.mode = 'playing';
    this.elapsed = 0;
    this.spawnTimer = 0.4;
    this.director.startRound();
    this.pushHud();
  }

  endRound() {
    const total = this.director.runningTotal;
    const payout = this.cfg.floorPayout ? Math.max(0, total) : total;
    this.balance += payout;
    this.saveBalance();
    this.mode = 'ambient';
    this.pushHud();
    this.cb.onRoundEnd?.({
      total,
      payout,
      staked: this.director.totalStaked,
      balance: this.balance,
    });
  }

  // -- fruit lifecycle --------------------------------------------------------

  spawnFruit() {
    const def = pickWeighted(this.cfg.fruits, f => f.weight);
    const group = buildWhole(def);
    const x = rand(-this.halfW * 0.65, this.halfW * 0.65);
    const bottom = this.camY - this.halfH;
    group.position.set(x, bottom - 1.5, rand(-0.8, 0.8));
    this.scene.add(group);

    const ph = this.cfg.physics;
    const fruit = {
      def, group,
      vel: new THREE.Vector3(
        -x * rand(0.06, 0.22) + rand(-ph.driftX, ph.driftX) * 0.4,
        rand(ph.launchYMin, ph.launchYMax),
        0,
      ),
      angVel: new THREE.Vector3(rand(-ph.spin, ph.spin), rand(-ph.spin, ph.spin), rand(-ph.spin, ph.spin)),
      label: new PrizeLabel(
        this.scene,
        () => def.paytable.map(e => e.mult * this.betFor(def)),
        v => this.cb.formatMoney(v),
      ),
      sliced: false,
    };
    this.fruits.push(fruit);
  }

  removeFruit(fruit, keepLabel) {
    this.scene.remove(fruit.group);
    if (keepLabel) this.deadLabels.push(fruit.label);
    else fruit.label.dispose();
    const i = this.fruits.indexOf(fruit);
    if (i >= 0) this.fruits.splice(i, 1);
  }

  updateSpawning(dt) {
    const s = this.cfg.spawn;
    const ambient = this.mode !== 'playing';
    const max = ambient ? s.ambientMaxConcurrent : s.maxConcurrent;
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
    }
    for (let i = 0; i < batch && this.fruits.length < max; i++) this.spawnFruit();
  }

  updateFruits(dt) {
    const g = this.cfg.physics.gravity;
    const bottom = this.camY - this.halfH;
    const labelPos = new THREE.Vector3();
    for (let i = this.fruits.length - 1; i >= 0; i--) {
      const f = this.fruits[i];
      f.vel.y -= g * dt;
      f.group.position.addScaledVector(f.vel, dt);
      f.group.rotation.x += f.angVel.x * dt;
      f.group.rotation.y += f.angVel.y * dt;
      f.group.rotation.z += f.angVel.z * dt;
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
    const bet = this.betFor(f.def);
    if (this.balance < bet) {
      if (this.insufficientCooldown <= 0) {
        this.cb.onInsufficient?.();
        this.insufficientCooldown = 1.2;
      }
      return;
    }
    f.sliced = true;
    this.balance -= bet;
    const result = this.director.onSlice(f.def, bet);
    this.saveBalance();

    // Orient the cut from the swipe: halves separate perpendicular to the
    // swipe direction, tilted a little toward the camera so the flesh shows.
    const swipe = new THREE.Vector3(dx, -dy, 0).normalize();
    const sep = new THREE.Vector3(-swipe.y, swipe.x, 0).add(new THREE.Vector3(0, 0, 0.7)).normalize();

    const pos = f.group.position.clone();
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
    this.insufficientCooldown -= dt;

    if (this.mode === 'playing') {
      this.elapsed += dt;
      this.director.tick(this.elapsed);
      this.pushHud();
      if (this.elapsed >= this.cfg.roundSeconds) this.endRound();
    }

    this.updateSpawning(dt);
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
