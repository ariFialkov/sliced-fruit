// ============================================================================
// RNG + the round "director".
//
// Betting model: the player places ONE bet when the round starts. Before the
// round, a single roll against `roundOutcomes` (EV normalised to CONFIG.rtp)
// fixes the round's destination: targetTotal = bet × rolledMultiplier — so a
// $20 bet trends to ~$20 by the end of the round at RTP 1.0.
//
// During the round every sliced fruit contributes a share of the bet,
// positive or negative. The director tilts each slice's paytable sampling
// toward whatever value closes the gap to the target by the final second —
// gently at first, firmly late. If the player slices a lot and the total
// runs hot, negative (disguised bomb) outcomes get favoured to pull it back;
// if the total lags, big positive outcomes get favoured. The steering is
// noisy and gradual, so the round never looks like it's on rails.
// ============================================================================

export function rand(min = 0, max = 1) {
  return min + Math.random() * (max - min);
}

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickWeighted(items, weightOf) {
  let total = 0;
  for (const it of items) total += weightOf(it);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weightOf(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function expectedValue(entries, valueOf, weightOf) {
  let ev = 0, tw = 0;
  for (const e of entries) { ev += valueOf(e) * weightOf(e); tw += weightOf(e); }
  return tw > 0 ? ev / tw : 0;
}

// Scale a table's values so its EV equals `targetEV`. Lets designers edit
// weights/values freely in config.js without breaking RTP.
function normalize(entries, valueOf, setValue, weightOf, targetEV) {
  const ev = expectedValue(entries, valueOf, weightOf);
  if (ev <= 0) return; // degenerate table — leave as-is rather than divide by zero
  const k = targetEV / ev;
  for (const e of entries) setValue(e, valueOf(e) * k);
}

export function prepareConfig(cfg) {
  normalize(cfg.roundOutcomes, e => e.t, (e, v) => { e.t = v; }, e => e.w, cfg.rtp);
  // Fruit paytables keep EV 1 relative to their share of the bet, so no fruit
  // choice is smarter than another.
  for (const fruit of cfg.fruits) {
    normalize(fruit.paytable, e => e.mult, (e, v) => { e.mult = v; }, e => e.w, 1);
  }
  return cfg;
}

export class RoundDirector {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.bet = 0;
    this.targetMult = 1;    // round multiplier rolled at start
    this.targetTotal = 0;   // bet × targetMult — where the round should land
    this.runningTotal = 0;  // currency accumulated so far this round
    this.slices = 0;
    this.sliceRate = 1.2;   // EMA of observed slices/sec
    this.lastSliceAt = null;
    this.elapsed = 0;
  }

  startRound(bet) {
    this.reset();
    this.bet = bet;
    this.targetMult = pickWeighted(this.cfg.roundOutcomes, e => e.w).t;
    this.targetTotal = bet * this.targetMult;
  }

  tick(elapsedSeconds) {
    this.elapsed = elapsedSeconds;
  }

  get remaining() {
    return Math.max(0, this.cfg.roundSeconds - this.elapsed);
  }

  // The baseline currency chunk one average slice is worth.
  get share() {
    return this.bet / this.cfg.director.expectedSlices;
  }

  // Called when the player slices `fruitDef`.
  // Returns { mult, value } — value is the signed currency result.
  onSlice(fruitDef) {
    const d = this.cfg.director;

    // Track how fast this player actually slices, to estimate slices left.
    const now = this.elapsed;
    if (this.lastSliceAt !== null) {
      const gap = Math.max(0.05, now - this.lastSliceAt);
      this.sliceRate += d.rateEmaAlpha * (1 / gap - this.sliceRate);
    }
    this.lastSliceAt = now;
    this.slices++;

    // This fruit's baseline value, before the multiplier roll.
    const unit = this.share * fruitDef.valueFactor;

    // Where should the total be heading, and how much per slice to get there?
    const gap = this.targetTotal - this.runningTotal;
    const rate = Math.max(d.minSliceRate, this.sliceRate);
    const slicesLeft = Math.max(1, rate * this.remaining);
    const jitter = 1 + rand(-d.jitter, d.jitter);
    const desiredMult = (gap / slicesLeft / unit) * jitter;

    // Steering strength ramps over the round.
    const p = Math.min(1, this.elapsed / this.cfg.roundSeconds);
    const bias = d.minBias + (d.maxBias - d.minBias) * Math.pow(p, d.ramp);

    const outcome = pickWeighted(
      fruitDef.paytable,
      e => e.w * Math.exp(-bias * Math.abs(e.mult - desiredMult)),
    );

    const value = round2(outcome.mult * unit);
    this.runningTotal = round2(this.runningTotal + value);
    return { mult: outcome.mult, value };
  }

  // Golden fruit: multiply the current total (steering later pulls the round
  // back toward its target, so the economy self-corrects). If the total is
  // at or below zero a multiplier would feel like nothing (or a punishment),
  // so grant a flat bonus share instead.
  applyGolden(mult) {
    let add;
    if (this.runningTotal > 0) {
      add = round2(this.runningTotal * (mult - 1));
    } else {
      add = round2(this.share * mult);
    }
    this.runningTotal = round2(this.runningTotal + add);
    return add;
  }
}
