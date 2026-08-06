// ============================================================================
// RNG + the round "director".
//
// Fairness model:
//  * Before each round, one roll against `roundOutcomes` fixes the round's
//    target: final total ≈ target × everything staked that round. The
//    distribution's EV is normalised to CONFIG.rtp, so RTP holds per bet no
//    matter how many fruits the player actually slices.
//  * Each slice's result is sampled from the fruit's paytable, with weights
//    tilted toward whatever per-slice value would close the gap to the target
//    by the end of the 60s. The tilt starts negligible and ramps up, so the
//    round drifts to its destination without visible rails.
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
  for (const fruit of cfg.fruits) {
    normalize(fruit.paytable, e => e.mult, (e, v) => { e.mult = v; }, e => e.w, cfg.rtp);
  }
  return cfg;
}

export class RoundDirector {
  constructor(cfg) {
    this.cfg = cfg;
    this.reset();
  }

  reset() {
    this.target = 1;        // round multiplier rolled at start
    this.totalStaked = 0;   // currency staked so far this round
    this.runningTotal = 0;  // currency result so far this round
    this.sliceRate = 1.2;   // EMA of observed slices/sec
    this.lastSliceAt = null;
    this.elapsed = 0;
  }

  startRound() {
    this.reset();
    this.target = pickWeighted(this.cfg.roundOutcomes, e => e.w).t;
  }

  tick(elapsedSeconds) {
    this.elapsed = elapsedSeconds;
  }

  get remaining() {
    return Math.max(0, this.cfg.roundSeconds - this.elapsed);
  }

  // Called when the player slices `fruitDef` betting `bet` currency.
  // Returns { mult, value } — value is the signed currency result.
  onSlice(fruitDef, bet) {
    const d = this.cfg.director;

    // Track how fast this player actually slices, to estimate slices left.
    const now = this.elapsed;
    if (this.lastSliceAt !== null) {
      const gap = Math.max(0.05, now - this.lastSliceAt);
      this.sliceRate += d.rateEmaAlpha * (1 / gap - this.sliceRate);
    }
    this.lastSliceAt = now;

    this.totalStaked += bet;

    // Where should the total be heading, and how much per slice to get there?
    const gap = this.target * this.totalStaked - this.runningTotal;
    const rate = Math.max(d.minSliceRate, this.sliceRate);
    const slicesLeft = Math.max(1, rate * this.remaining);
    const jitter = 1 + rand(-d.jitter, d.jitter);
    const desiredMult = (gap / slicesLeft / bet) * jitter;

    // Steering strength ramps over the round.
    const p = Math.min(1, this.elapsed / this.cfg.roundSeconds);
    const bias = d.minBias + (d.maxBias - d.minBias) * Math.pow(p, d.ramp);

    const outcome = pickWeighted(
      fruitDef.paytable,
      e => e.w * Math.exp(-bias * Math.abs(e.mult - desiredMult)),
    );

    const value = outcome.mult * bet;
    this.runningTotal += value;
    return { mult: outcome.mult, value };
  }
}
