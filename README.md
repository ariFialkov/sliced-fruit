# Sliced Fruit 🍉

A low-poly 3D fruit-slicing betting game (PWA) — Fruit Ninja mechanics with
real-stakes framing. Swipe to slice; **every slice places a bet**, the rolling
prize above each fruit lands on the result like a slot reel, and disguised
bombs blow a hole in your round total.

Works on mobile (finger swipe) and desktop (mouse / trackpad swipe), installs
as a PWA, and plays fully offline once cached.

## Running

It's a static site — serve the repo root over HTTP (ES modules and the service
worker don't run from `file://`):

```bash
npx serve .            # or:
python3 -m http.server 8000
```

Then open `http://localhost:8000`. For PWA install + service worker on a real
device you'll need HTTPS (any static host works: GitHub Pages, Netlify, etc.).

## Game flow

1. **Menu** — attract screen with fruit popping up behind it, rolling prize
   indicators included. Pick a stake multiplier (×1/×2/×5/×10) in-game.
2. **60-second round** — swipe to slice. Each slice bets
   `baseStake × multiplier × fruit.stakeFactor` and adds the rolled result
   (positive or negative) to your round total.
3. **Cash out** — when the timer ends you're paid `max(0, roundTotal)`
   (configurable).

## Fairness / RTP model

- Before each round, one RNG roll against `roundOutcomes` fixes the round's
  target return (as a multiple of everything staked that round).
- During the round the **director** (`js/rng.js`) tilts each slice's paytable
  sampling toward whatever per-slice value closes the gap to that target by
  the end of the 60s — gently at first, firmly in the final seconds — so the
  game *feels* skill-based but trends to the configured RTP.
- Whether a fruit is positive or a disguised bomb is decided **at slice time**,
  so it is indistinguishable beforehand by design.

## Tuning

Everything lives in [`js/config.js`](js/config.js):

| Knob | What it does |
| --- | --- |
| `rtp` | Target return-to-player (1.0 = break even). |
| `roundOutcomes` | Distribution of pre-rolled round targets. |
| `fruits[].paytable` | Per-fruit outcomes (`mult` × bet) and weights; negative entries are the bombs. |
| `fruits[].stakeFactor` / `weight` | Per-fruit bet size and spawn frequency. |
| `director.*` | How hard/late results are steered toward the round target. |
| `floorPayout` | Cap losses at the amount staked. |
| `spawn`, `physics`, `swipe` | Pacing, arcs, and slice feel. |

Paytables and round outcomes are **free-form**: on load the engine rescales
their values so every table's expected value equals `rtp` exactly, so you can
tweak weights without breaking the math.

## Stack

Vanilla ES modules + [Three.js](https://threejs.org) (vendored in `lib/`,
MIT — see `lib/THREE-LICENSE`). No build step, no other dependencies.
