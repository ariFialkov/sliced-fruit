// ============================================================================
// Tiny WebAudio synth — no audio assets needed. Context is created lazily on
// first user gesture to satisfy autoplay policies.
// ============================================================================

let ctx = null;

export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { /* audio unsupported — stay silent */ }
  }
  if (ctx?.state === 'suspended') ctx.resume();
}

function noiseBuffer(seconds = 0.3) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function env(gainNode, t, peak, decay) {
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + decay);
}

export function sfxSlice() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.18);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(2600, t);
  bp.frequency.exponentialRampToValueAtTime(900, t + 0.15);
  const g = ctx.createGain();
  env(g, t, 0.25, 0.16);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t);
}

export function sfxSplat(pitch = 1) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(260 * pitch, t);
  o.frequency.exponentialRampToValueAtTime(90 * pitch, t + 0.14);
  const g = ctx.createGain();
  env(g, t, 0.3, 0.16);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.2);
}

export function sfxBoom() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(35, t + 0.5);
  const g = ctx.createGain();
  env(g, t, 0.7, 0.55);
  o.connect(g).connect(ctx.destination);
  o.start(t); o.stop(t + 0.6);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(0.5);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3000, t);
  lp.frequency.exponentialRampToValueAtTime(200, t + 0.45);
  const g2 = ctx.createGain();
  env(g2, t, 0.5, 0.5);
  src.connect(lp).connect(g2).connect(ctx.destination);
  src.start(t);
}

export function sfxWin() {
  if (!ctx) return;
  const t = ctx.currentTime;
  [523, 784].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    env(g, t + i * 0.09, 0.12, 0.25);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.3);
  });
}
