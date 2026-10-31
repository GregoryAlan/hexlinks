# Hexlinks — Plan v2: macro Ledger × micro Swing (fun-test prototype)

_v1 (2026-08-29) designed a golf-RPG with encounters and battles; P0–P1 shipped under it. v2 (2026-10-31) pivots the goal: **test whether a macro resource-allocation game on the hex map fused with a micro golf-shot game makes a fun, non-disjointed style.** Sections marked **(kept)** carry over from v1 unchanged in substance. Sections marked **(shelved)** are v1 systems that are not deleted but not built until the fun test says so._

## Context

Hexlinks has a walkable isometric hex course with per-hex elevation, cursed fog, A* traversal, a stack-based scene manager, and a ported matter-js side-view stage (tests only). Nothing exists yet for shots or economy. Greg's overarching question is whether two game styles nobody would think to combine — a management game about allocating scarce resources over territory, and a golf shot game about clubs, swing timing, spin and shot shapes — can be one game. The prototype is built to answer that with explicit metrics, then grown or re-coupled depending on the answer.

## Locked decisions

- **Name/theme (kept):** hexlinks — hex tiles and hex curses. Undead/witchy/occult golf; dry-snarky Golf Story register. The undead Caddy and the necromantic Groundskeeper remain the cast; the Groundskeeper's pressure is now *systemic* (fog regrowth, upkeep decay, wind) rather than encounters.
- **Art direction (kept, chosen 2026-08-29):** "Overgrown Estate" — Gorey-esque pen-and-ink on bone paper, one dried-blood red accent (#7d2a24), ink #2b2822 on bone #efeade, Fredericka the Great display + Georgia body. Flat fills + sparse rough.js scratch motifs (P1 decision; hachure kept as fallback). Style canvas: https://claude.ai/code/artifact/c7cb8a2e-24e5-4206-bb36-39f5ac4352b0.
- **Overworld (kept):** isometric 2.5D hex prisms on Canvas 2D, per-hex elevation that affects play, portrait viewport.
- **Two modes, one game.** The MACRO is the **Ledger**: resources, territory, daylight, nightfall building. The MICRO is the **Swing**: club, 3-tap meter, aim, spin, shot shape, ballistics against the heightfield. **Battles, encounters, mini-games, tutorial beats, home base and meta-persistence are shelved.**
- **Shots execute on the iso hex map.** Pure deterministic 2.5D ballistics (no matter-js). Aim is tap-to-target (plus a captured drag on the target marker), not slingshot. The side-view stage stays parked for later hazard lies.
- **Macro clock = holes by day, build at night.** A run is 5 days on a 3-hole shared region. Nightfall is a mode of the overworld scene on the same map, not a separate screen.
- **Prototype-first.** Smallest slice that lets the coupling be felt, instrumented for the hypothesis below. Not a six-milestone build.

## The design

### The glue (why it isn't disjointed)

1. **One scarce resource both modes spend: daylight.** Each stroke costs fixed minutes; each hex walked costs minutes (×2 in fog, + per level climbed). The day ends at hole-out or when daylight runs out. The macro asks *what to spend a stroke on*; the micro asks *can you actually execute it*.
2. **The ball is the worker.** Worker placement, except you place the meeple by hitting it there. The ball's rest hex is **harvested** (yield by terrain), its flight path **clears fog** and claims territory, and the pin pays **Coin**. Every stroke is a progress-vs-harvest-vs-territory choice; execution precision sets the yield.
3. **The terrain you build is the lie you hit from.** Grade a ridge at night and tomorrow's ridge check changes. Skip upkeep and the fairway you cleared refogs. Lay cart path and the walk is cheap, leaving daylight for strokes.
4. **One substrate, one state.** Both modes read and write `HoleMap` + `RunState`. No management screen you "go to".

### MICRO — the Swing (`src/shot/`, pure)

| Piece | Design |
|---|---|
| Aim | Tap a target hex (drag the marker to fine-tune). Preview: corridor to be cleared, dispersion ring, predicted rest hex, **yield readout** for cleared/claimed hexes only (fog hides detail). Camera may pan freely in aim. |
| Clubs | Start bag Driver / Iron / Wedge / Putter; buyable Hybrid, Lob Wedge. Per club: `maxCarry` (hexes), `loft` (apex in elevation levels), `rollFactor`, `dispersion`, `sweetSpotWidth`, `shapes[]`. |
| Swing meter | Classic 3-tap: tap 1 starts the sweep, tap 2 sets power (0..1), tap 3 sets accuracy (signed offset from the sweet-spot mark). Lie scales sweep speed and sweet-spot width; side-slope shifts the sweet spot. Pure state machine over the scene clock; the shot records `{powerT, accT}` so it is golden-testable. |
| Spin | Pre-swing: back/top (roll modifier) and draw/fade (lateral curve across the flight; narrows the sweet spot). Draw/fade is how you bend around a tree hex. |
| Shot shapes | Standard; **Punch** (low apex, extra roll, under canopy); **Flop** (high apex, no roll, −40% range, clears ridges); **Bump-and-run** (fairway only, putter-like). Club-constrained. |
| Ballistics | 2.5D: along-line `s`, lateral from accuracy error + curve, height parabola with apex = `loft × shapeMult`. Sample ≥4 per hex; ridge strike when the ball is below a cell's elevation, canopy strike at tree hexes. Roll follows the downhill gradient with terrain friction. Daily wind vector. `resolveShot(input, map, rng|null): ShotOutcome` — `rng = null` gives the mean path for previews. |
| Landing | water → drop at last dry hex on the corridor, +1; oob → replay, +1; sand/deep rough kill roll; fairway/green roll. Pure `rules/landing.ts`. |

### MACRO — the Ledger (`src/rules/`, `src/state/run.ts`, pure)

- **Resources:** Turf (upkeep + building), Timber (structures), Coin (score; buys clubs).
- **Per stroke:** rest hex harvested — trees → Timber, fairway/rough → Turf, green → Coin, hole-out → Coin bonus by strokes under par. A `rich` cell modifier doubles yield. `clearedPath` unions into `clearedHexes` and is auto-claimed (`claimed ⊆ cleared`).
- **Daylight:** `DAYLIGHT.minutes` per day; `strokeMinutes`; walking costs `stepCost × minutesPerCost` (fog ×2 and climbs already in `stepCost`). Out of daylight → nightfall where the ball lies; the next dawn resumes from the ball.
- **Nightfall:** (1) yields from claimed hexes by terrain; (2) upkeep: Turf per N claimed hexes, shortfall reverts farthest-from-structure hexes to fog (shown before confirming); (3) fog regrows on cleared-but-unclaimed hexes except within Lantern radius and the tee reveal; (4) build on claimed hexes — **Lantern** (Timber; holds fog r=2), **Cart path** (Turf; move cost 1), **Grade** (Turf; elevation −1, rebakes terrain), **Tee marker** (Timber+Turf; legal dawn start); **Shed** sells clubs for Coin; (5) dawn: next hole, wind rerolled from the seed.
- **Run:** 5 days. Lose if Turf < 0 at nightfall. Score = Coin + claimed hexes. Seeded; shareable seed.

### Fun-test hypothesis and metrics

Players will sometimes choose harvest or territory over progress to the pin, and the swing meter makes that choice feel earned rather than rolled. `StrokeLog` per stroke (intent = progress/harvest/territory/mixed, club, shape, accuracy, yield, newly claimed, daylight spent, progressRatio vs the best available) and `DayLog` per day (strokes, walk vs stroke minutes, Turf at night, upkeep, reverted, builds). After 10 runs: % strokes with intent ≠ progress (target ≥ ~20%, not all on day 5), Turf-death rate, builds per run. If non-progress is ~0 yields are too low or daylight too tight; if the pin is never pursued, Coin is too weak.

## Architecture

**(kept)** Vanilla TypeScript + Vite, canvas 2D, deps `matter-js` (dormant), `roughjs`, `seedrandom`, `poly-decomp`; dev `vitest`, `typescript`. Portrait everywhere.

**Layer discipline (kept, the #1 rule):** `core/hex/shot/rules/state` import no DOM and no matter-js → `stage/` imports matter-js but no DOM → `scenes/` touch DOM only via SceneContext → only `main.ts`, `input/`, `render/` touch DOM/canvas. Everything below `scenes/` runs headless in vitest.

### Directory layout (v2)

```
src/
  core/      rng.ts, vec/types.ts, config.ts (ALL tuning constants), debug.ts
  hex/       coords.ts, map.ts (HoleMap + holes[]), path.ts (A*), prism.ts
  shot/      types.ts, ballistics.ts (pure 2.5D flight), meter.ts (swing meter)
  rules/     landing.ts, harvest.ts, night.ts, build.ts          ← pure game math
  state/     run.ts (RunState reducers), telemetry.ts (StrokeLog/DayLog)
  data/      clubs.ts, tutorial.ts, region.ts (3-hole shared map), fixtures.ts
  scenes/    sceneManager.ts, homeBase.ts (title/launcher), overworld.ts (modes: traverse/aim/swing/flight/night/over), runSummary.ts
  render/    camera.ts, hexRenderer.ts (+invalidate, setActiveHole), meterHud.ts, roughCache.ts, effects.ts
  stage/     physicsStage.ts (dormant; side-view lies later)
  input/     gestures.ts (+captured drag)
  ui/        overlay.ts (show/clear/hud + panel)
```

### Reuse from ink-links (kept)

Verbatim: `rng.ts`, `audio.ts`, `render/effects.ts`, `render/roughCache.ts`, shell CSS, Vite config, Pages workflow. Adapted: `physics.ts` → `stage/physicsStage.ts` (applySurface etc., dormant), input pointer capture, storage reducer pattern, generate → gate → retry (for `region`/`holeGen` later), three-layer canvas bake strategy.

### Scene system (kept)

Stack-based push/pop; results return on pop; requests deferred to tick boundaries; DOM only through `SceneContext.overlay` (`show/clear/hud` + non-modal `panel`). In v2 the overworld owns almost everything as **modes** (nightfall included — it needs the bakes, camera and picking); the only pushes are title → overworld and overworld → run summary.

### Hex engine (kept)

`hex/coords.ts` axial pointy-top math, iso projection (y-squash 0.56, 16 px per level), top-elevation-first picking. `hex/map.ts` `TerrainKind`, `HexCell {coord, terrain, elevation, modifiers}`, `HoleMap {seed, name, par, cells, tee, pin, holes[], worldBounds}`, ASCII `<glyph><elev>` format. `hex/path.ts` A* with terrain costs, +1/level climb, >2-level cliffs block, ×2 in fog. `render/hexRenderer.ts` bake-once terrain + fog layers, painter's order = (r, q) sort, per-frame occluders; v2 adds `invalidate(map, changed)` for Grade/Cart path and `setActiveHole`.

### Overworld modes and input routing

`Mode = traverse | aim | swing | flight | night{report|build|shed} | over`. One `GestureRecognizer`; its callbacks switch on mode. Additions: `shouldCapture(pos)` → captured drag (never pans/taps); meter taps read on raw pointer-down (tap fires on up — too laggy); `gestures.reset()` on entering swing/flight.

| Mode | tap | drag | pinch/wheel | DOM |
|---|---|---|---|---|
| traverse | walk; tap ball while on it → aim | pan | zoom | HUD ledger; panel Aim / Walk to ball |
| aim | set target; Cancel → traverse | captured on target marker, else pan | zoom | panel: clubs, shape, spin, Swing |
| swing | — (raw down drives the meter) | ignored | ignored | meter on canvas |
| flight | fast-forward | ignored | ignored | — |
| night/build | place/inspect tool on claimed hex | pan | zoom | report/shed cards; build palette + Sleep |
| over | — | — | — | summary → pop |

### Cursed fog (revised)

`clearedHexes` (visible) ⊇ `claimedHexes` (yours). Shots clear and claim their corridor. Fog **regrows** each night on cleared-but-unclaimed hexes (except Lantern radius and tee reveal); unpaid upkeep reverts claimed hexes. Fogged hexes stay dim silhouettes; the aim preview shows yields only for cleared hexes. Fog layer = bake full cover, punch out cleared; rebake when the `clearedHexes` Set identity changes.

### State

`RunState` (per run, pure reducers): `seed, day, holeIndex, phase, strokes, strokesTotal, daylight, resources{turf,timber,coin}, clearedHexes, claimedHexes, structures, bag, partyHex, ballHex, stepsTaken, wind, log, holesCompleted`. Reducers `beginRun, applyShot, stepParty, endDay, dawn`. Only `ShotRecord` (hexes + enums) enters state — never flight floats. RNG per stroke `makeRng(\`${seed}:d${day}:s${n}\`)`. Persistence shelved.

### Shelved (v1 systems kept on file, not built)

Side-view mini-games (Bunker Blast, Read the Green, Skim Shot), turn-based slingshot battles and the enemy roster, encounter tables, gear/skill progression, Course Hex modifiers, the scripted tutorial beats, home base screens, MetaSave. v1's text for these lives in git history (`git show 11e12f2:PLAN.md`).

## Steps (each ends green + playable; ~4 sessions)

| Step | Playable result |
|---|---|
| 1a Pure shot core | tests only: `shot/types`, `ballistics`, `data/clubs`, `rules/landing`, RunState extensions |
| 1b Aim + flight on map | tap ball → aim → club → auto-perfect swing → arc → fog carved → walk → hole-out card |
| 2 Swing meter + spin/shape | real 3-tap swing; lie/slope shape the meter |
| 3 Ledger + daylight + nightfall | 5-day run on the tutorial hole with yields, upkeep, regrowth, lose/score card |
| 4 Build mode + Shed | Lantern / Cart path / Grade / Tee marker; buy clubs; terrain change alters tomorrow |
| 5 Three-hole region | whole run on one shared map; territory compounds |
| 6 Playtest harness | metrics in HUD + `debugState`, JSON dump, `?seed=&day=` |

## Verification (kept + v2)

Unit/headless (vitest, gates deploy): hex math, A* invariants, **ballistics goldens + invariants + seed sweep**, **meter goldens**, pure reducers (`run`, `landing`, `harvest`, `night`, `build`), region snapshot + walkability, scene-manager push/pop, gesture capture. Manual/E2E: `npm run dev` on desktop + 390-wide; `scripts/e2e-smoke.mjs` extended through aim → swing → flight; `scripts/e2e-playtest.mjs` dumps logs. Deploy: push → Pages (test-gated).

## Open risks

1. **Meter latency on touch** — read on raw pointer-down, draw on canvas in the same frame; validate on a phone in step 2.
2. **Coupling too weak or too strong** — if nobody harvests, raise yields or loosen daylight; if nobody chases the pin, raise Coin. Levers all in `config.ts`.
3. **Region bake size** (issue #18) — ~560 cells × bakeScale 2; drop to 1.5 before chunking.
4. **Cross-device float drift (kept)** — only `ShotRecord` enters state.
5. **Fog information hiding** (issue #9) — the yield readout must not leak fogged terrain.

## Key reference files (ink-links, kept)

`src/physics.ts`, `src/generation.ts` + `src/reachability.ts`, `src/storage.ts`, `src/render/renderer.ts` + `roughCache.ts`, `src/input.ts`, `src/config.ts`, `src/rng.ts`, `src/audio.ts`, `.github/workflows/deploy.yml`.
