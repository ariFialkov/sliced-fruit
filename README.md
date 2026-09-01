# Sliced Fruit 🍉

A smooth, cartoony 3D fruit-slicing betting game (PWA) — Fruit Ninja mechanics with
real-stakes framing. Place a bet, then swipe to slice: the rolling prize above
each fruit lands on the result like a slot reel and adds to (or takes from)
your round total, which trends toward your bet x RTP by the end of the timer.
Disguised bombs blow a hole in the total when it runs hot.

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

1. **Menu** — a night-sky attract screen: the blender sits centre stage
   under a light beam, confetti drifts, and whole fruit and pre-sliced halves
   tumble past with rolling prize indicators. Pick your bet, then start the
   round — the bet is debited up front and the sky fades to day.
2. **30-second round** — swipe to slice. Each sliced fruit rolls a share of
   the bet (`bet / expectedSlices × fruit.valueFactor × multiplier`), positive
   or negative, into your round total.
3. **Cash out** — when the timer ends you're paid `max(0, roundTotal)`
   (configurable).

## Fairness / RTP model

- When a round starts, one RNG roll against `roundOutcomes` fixes the round's
  destination: `targetTotal = bet × rolledMultiplier` (EV = `rtp`, so a $20
  bet trends to ~$20).
- During the round the **director** (`js/rng.js`) tilts each slice's paytable
  sampling toward whatever per-slice value closes the gap to that target by
  the end of the round — gently at first, firmly in the final seconds — so the
  game *feels* skill-based but trends to the configured RTP. If heavy slicing
  pushes the total over the target, negative (bomb) outcomes get favoured to
  pull it back; if it lags, big wins get favoured.
- Whether a fruit is positive or a disguised bomb is decided **at slice time**,
  so it is indistinguishable beforehand by design.
- **The blender guarantees the result is reachable.** Values used to come only
  from player slices, so an idle player finished at $0 regardless of the roll.
  The blender patrols the bottom of the screen and catches falling fruit
  through the same director, so the total still travels to its target with no
  input at all. It only hunts when the total drifts off the pace toward its
  target, so an engaged player rarely loses fruit to it. Measured over idle
  rounds: 12-19 catches per round, median error ~$0.20 from the rolled target.

## Bonus features

- **Golden fruit** — rare, unmistakably golden, never a bomb. Slicing one
  multiplies the current round total (×1.5/×2/×3, weighted); if the total is
  at or below zero it grants a flat bonus share instead. Goldens never spawn
  in the final seconds, so the director can re-balance afterwards.
- **Frenzy** — a rare mid-round bonus window: the sky goes dark, fruit glows,
  and far more of it flies up for ~10 seconds. Frenzy values come from the
  same director budget, so it adds spectacle and action without breaking RTP.
  Tune both under `golden` and `frenzy` in `js/config.js`.

## Tuning

Everything lives in [`js/config.js`](js/config.js):

| Knob | What it does |
| --- | --- |
| `rtp` | Target return-to-player (1.0 = break even). |
| `roundOutcomes` | Distribution of pre-rolled round targets. |
| `betOptions` / `defaultBet` | The bet amounts the player can pick from. |
| `director.expectedSlices` | Slices a round is budgeted for — sets the per-slice share of the bet. |
| `fruits[].paytable` | Per-fruit outcomes (`mult` × share) and weights; negative entries are the bombs. |
| `fruits[].valueFactor` / `weight` | Per-fruit value swing size and spawn frequency. |
| `director.*` | How hard/late results are steered toward the round target. |
| `floorPayout` | Cap losses at the bet amount. |
| `blender.*` | Catch mouth size, patrol/hunt speed, and how eagerly it steps in. |
| `spawn`, `physics`, `swipe` | Pacing, arcs, and slice feel. |

Paytables and round outcomes are **free-form**: on load the engine rescales
their values so every table's expected value equals `rtp` exactly, so you can
tweak weights without breaking the math.

## Building for another host

There is no bundler — the game is plain ES modules with Three.js vendored in —
so the build just assembles the runtime files into `dist/`:

```bash
npm run build      # -> dist/
npm run preview    # serve dist/ at http://localhost:8000
```

Upload the **contents** of `dist/` so `index.html` sits at the top level. All
paths are relative, so serving it from a subfolder works too. The manifest is
named `manifest.json` (not `.webmanifest`) for hosts that reject that
extension.

## Stack

Vanilla ES modules + [Three.js](https://threejs.org) (vendored in `lib/`,
MIT — see `lib/THREE-LICENSE`). No bundler, no dependencies, and no image
assets: every fruit is procedural geometry (`js/fruits.js`) wearing textures
painted to canvases at load time (`js/textures.js`).

`npm run build` emits only web-safe file extensions — hosts often reject
unknown or extensionless uploads — and inlines the Three.js MIT notice into the
top of its bundle, so `lib/THREE-LICENSE` stays in the repo but never needs to
be uploaded. Anything skipped is listed in the build output.
