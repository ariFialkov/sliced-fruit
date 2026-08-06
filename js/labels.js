// ============================================================================
// Rolling prize labels — the slot-reel style value that hovers over each
// fruit, cycling through that fruit's possible prizes, then "landing" on the
// real result with a pulse when the fruit is sliced.
// ============================================================================

import * as THREE from '../lib/three.module.min.js';
import { pick } from './rng.js';

const W = 256, H = 96;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class PrizeLabel {
  // valuesFn returns the current list of possible prize amounts (currency),
  // so labels stay correct when the player changes their stake mid-flight.
  constructor(scene, valuesFn, formatFn) {
    this.valuesFn = valuesFn;
    this.format = formatFn;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.SpriteMaterial({ map: this.tex, depthTest: false, transparent: true });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set(2.2, 2.2 * (H / W), 1);
    this.sprite.renderOrder = 10;
    this.scene = scene;
    scene.add(this.sprite);

    this.rollTimer = 0;
    this.landed = false;
    this.landT = 0;
    this.baseScale = 2.2;
    this.roll();
  }

  roll() {
    const values = this.valuesFn();
    this.draw(this.format(pick(values)), '#ffe066', 'rgba(20,16,34,0.72)');
  }

  draw(text, color, bg) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 8, 14, W - 16, H - 28, 30);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, H / 2 + 2);
    this.tex.needsUpdate = true;
  }

  land(value) {
    this.landed = true;
    this.landT = 0;
    const win = value > 0;
    const text = (win ? '+' : '') + this.format(value);
    this.draw(
      text,
      win ? '#69f0a0' : '#ff6b6b',
      win ? 'rgba(9,48,29,0.88)' : 'rgba(58,12,12,0.88)',
    );
  }

  // Track a world position; roll while live, pulse & float once landed.
  update(dt, pos) {
    if (!this.landed) {
      this.sprite.position.copy(pos);
      this.rollTimer -= dt;
      if (this.rollTimer <= 0) {
        this.rollTimer = 0.07;
        this.roll();
      }
    } else {
      this.landT += dt;
      // quick pop, then settle while drifting upward
      const pulse = 1 + 0.55 * Math.exp(-this.landT * 5) * Math.sin(this.landT * 24);
      const s = this.baseScale * 1.25 * pulse;
      this.sprite.scale.set(s, s * (H / W), 1);
      this.sprite.position.y += dt * 1.1;
      if (this.landT > 0.9) this.mat.opacity = Math.max(0, 1 - (this.landT - 0.9) / 0.4);
    }
  }

  get done() {
    return this.landed && this.landT > 1.3;
  }

  dispose() {
    this.scene.remove(this.sprite);
    this.tex.dispose();
    this.mat.dispose();
  }
}
