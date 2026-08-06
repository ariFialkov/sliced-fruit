// ============================================================================
// Sliced Fruit — central tuning file.
// Everything a designer may want to tweak lives here: RTP, paytables, spawn
// pacing, director aggressiveness, physics. Values are plain numbers; the
// engine (rng.js) renormalises paytables and round outcomes so the configured
// RTP always holds exactly, no matter how the weights below are edited.
// ============================================================================

export const CONFIG = {
  currency: '$',
  startingBalance: 1000,

  // The player places ONE bet when the round starts (debited up front); the
  // round total then trends toward bet × rtp by the end of the timer.
  betOptions: [1, 5, 10, 20, 50],
  defaultBet: 10,

  roundSeconds: 30,

  // Target return-to-player across a full round (1.0 = break even on average).
  // The pre-round "roll" and the fruit director both derive from this number.
  rtp: 1.0,

  // If true the player can never cash out below zero — a negative round total
  // simply pays nothing (losses are capped at the amount staked).
  floorPayout: true,

  // Pre-round roll: the round's expected outcome expressed as a multiplier of
  // the bet. Sampled once before the round starts; the director then steers
  // the round total toward bet × t. Weights are free-form — rng.js rescales
  // the `t` values so the expected value equals `rtp` exactly.
  roundOutcomes: [
    { t: 0.0, w: 8 },
    { t: 0.3, w: 22 },
    { t: 0.6, w: 20 },
    { t: 0.9, w: 18 },
    { t: 1.2, w: 14 },
    { t: 1.8, w: 10 },
    { t: 2.5, w: 5 },
    { t: 4.0, w: 2.4 },
    { t: 8.0, w: 0.6 },
  ],

  // How hard the director pulls slice outcomes toward the round target.
  director: {
    expectedSlices: 18,// slices a typical round is budgeted for — one average
                       // slice is worth bet/expectedSlices before multipliers
    minBias: 0.12,     // steering strength at the start of the round
    maxBias: 1.9,      // steering strength in the final seconds
    ramp: 1.6,         // >1 = stays subtle early, tightens late
    minSliceRate: 0.4, // assumed slices/sec floor when estimating what's left
    rateEmaAlpha: 0.25,// smoothing for the player's observed slice rate
    jitter: 0.35,      // random wobble on the desired per-slice value
  },

  // Fruit catalogue. Per fruit:
  //   weight      — relative spawn frequency
  //   valueFactor — how big this fruit's value swings are relative to the
  //                 baseline slice share (bigger fruit, bigger swings)
  //   paytable    — possible outcomes as multiples of this fruit's share.
  //                 Negative entries are the disguised bombs. Free-form:
  //                 rng.js rescales mults so every fruit's EV matches,
  //                 keeping the game non-skill-based across fruit choice.
  fruits: [
    {
      id: 'watermelon', name: 'Watermelon',
      weight: 16, valueFactor: 2.0, radius: 1.15,
      skin: 0x2f9e44, flesh: 0xff5d5d, rind: 0xd8f5c9, accent: 0x1e6f30,
      paytable: [
        { mult: -2.0, w: 14 }, { mult: 0.0, w: 16 }, { mult: 0.8, w: 30 },
        { mult: 2.0, w: 22 }, { mult: 5.0, w: 14 }, { mult: 10.0, w: 4 },
      ],
    },
    {
      id: 'orange', name: 'Orange',
      weight: 18, valueFactor: 1.0, radius: 0.72,
      skin: 0xff922b, flesh: 0xffc078, rind: 0xfff4e6, accent: 0xe8590c,
      paytable: [
        { mult: -1.5, w: 12 }, { mult: 0.5, w: 30 }, { mult: 1.0, w: 30 },
        { mult: 1.8, w: 18 }, { mult: 3.5, w: 10 },
      ],
    },
    {
      id: 'apple', name: 'Apple',
      weight: 18, valueFactor: 1.0, radius: 0.68,
      skin: 0xe03131, flesh: 0xf8f0d0, rind: 0xfff0f0, accent: 0x862e2e,
      paytable: [
        { mult: -1.0, w: 15 }, { mult: 0.5, w: 25 }, { mult: 1.0, w: 30 },
        { mult: 2.0, w: 20 }, { mult: 3.2, w: 10 },
      ],
    },
    {
      id: 'banana', name: 'Banana',
      weight: 20, valueFactor: 0.5, radius: 0.8,
      skin: 0xffd43b, flesh: 0xfff3bf, rind: 0xf5e089, accent: 0xb08d1a,
      paytable: [
        { mult: -1.0, w: 10 }, { mult: 0.6, w: 34 }, { mult: 1.0, w: 32 },
        { mult: 1.6, w: 16 }, { mult: 2.5, w: 8 },
      ],
    },
    {
      id: 'pineapple', name: 'Pineapple',
      weight: 16, valueFactor: 1.5, radius: 1.0,
      skin: 0xe8b12e, flesh: 0xffe066, rind: 0xf7d97c, accent: 0x2f9e44,
      paytable: [
        { mult: -2.0, w: 13 }, { mult: 0.0, w: 15 }, { mult: 0.8, w: 28 },
        { mult: 1.8, w: 24 }, { mult: 4.0, w: 15 }, { mult: 8.0, w: 5 },
      ],
    },
    {
      id: 'lemon', name: 'Lemon',
      weight: 16, valueFactor: 0.75, radius: 0.6,
      skin: 0xffdd33, flesh: 0xfdf3a6, rind: 0xfffbe0, accent: 0xe0b000,
      paytable: [
        { mult: -1.0, w: 10 }, { mult: 0.6, w: 32 }, { mult: 1.0, w: 30 },
        { mult: 1.5, w: 18 }, { mult: 2.2, w: 10 },
      ],
    },
    {
      id: 'passionfruit', name: 'Passionfruit',
      weight: 12, valueFactor: 1.0, radius: 0.62,
      skin: 0x6b2d5c, flesh: 0xffb340, rind: 0xf3e2c7, accent: 0x3d1a35,
      paytable: [
        { mult: -2.5, w: 12 }, { mult: 0.0, w: 16 }, { mult: 0.8, w: 26 },
        { mult: 2.0, w: 22 }, { mult: 6.0, w: 18 }, { mult: 12.0, w: 6 },
      ],
    },
    {
      id: 'pomegranate', name: 'Pomegranate',
      weight: 12, valueFactor: 1.25, radius: 0.78,
      skin: 0xc0273d, flesh: 0xff4d6d, rind: 0xf7d6c4, accent: 0x7a1024,
      paytable: [
        { mult: -2.0, w: 13 }, { mult: 0.5, w: 24 }, { mult: 1.0, w: 26 },
        { mult: 2.5, w: 20 }, { mult: 5.0, w: 12 }, { mult: 9.0, w: 5 },
      ],
    },
    {
      id: 'avocado', name: 'Avocado',
      weight: 12, valueFactor: 1.5, radius: 0.85,
      skin: 0x3f5d28, flesh: 0xbcd97e, rind: 0x2c4519, accent: 0x7a5230,
      paytable: [
        { mult: -1.5, w: 14 }, { mult: 0.4, w: 22 }, { mult: 1.0, w: 30 },
        { mult: 2.0, w: 22 }, { mult: 4.0, w: 12 },
      ],
    },
  ],

  // Golden bonus fruit: rare, unmistakably golden, never a bomb. Slicing one
  // multiplies the current round total (or grants a flat bonus share if the
  // total is at/below zero, so it always feels like a win).
  golden: {
    chance: 0.05,        // probability per spawned fruit
    cutoffSeconds: 10,   // never spawns in the last N seconds (gives the
                         // director time to re-balance after a multiplier)
    multipliers: [
      { m: 1.5, w: 60 }, { m: 2, w: 30 }, { m: 3, w: 10 },
    ],
  },

  // Frenzy: a rare mid-round bonus period — the sky goes dark, fruit glows,
  // and way more of it flies up for a few seconds. Values still come from the
  // same director budget, so frenzy adds spectacle and action, not free EV.
  frenzy: {
    chance: 0.3,             // probability a round gets a frenzy at all
    duration: 10,            // seconds
    earliestStart: 6,        // seconds into the round
    latestEndMargin: 4,      // must finish this many seconds before time-up
    spawnIntervalScale: 0.38,// spawn much faster…
    extraBatch: 2,           // …and more per batch…
    maxConcurrent: 12,       // …with a higher on-screen cap
  },

  spawn: {
    // In-round pacing: interval eases from `startInterval` to `endInterval`
    // over the round, batch size ramps too.
    startInterval: 1.5,
    endInterval: 0.8,
    minBatch: 1,
    maxBatch: 3,
    maxConcurrent: 7,
    // Menu (ambient) pacing — the attract loop behind the menu.
    ambientInterval: 1.9,
    ambientBatch: 2,
    ambientMaxConcurrent: 5,
  },

  physics: {
    gravity: 13.5,
    launchYMin: 12.0,   // vertical launch speed range
    launchYMax: 16.5,
    driftX: 2.6,        // max horizontal drift speed
    spin: 2.2,          // max angular speed (rad/s)
    killY: -4,          // despawn when below this and falling
  },

  swipe: {
    minSpeed: 0.22,     // px per ms below which a drag doesn't slice
    pad: 14,            // extra slice hit padding in px
    trailMs: 130,       // how long the blade trail persists
  },
};
