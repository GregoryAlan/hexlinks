# hexlinks

A macro resource game on a hex golf course fused with a micro golf-shot game. Isometric 2.5D hex overworld with cursed fog; the **Ledger** (Turf/Timber/Coin, daylight budget, nightfall building) and the **Swing** (clubs, 3-tap meter, spin, shot shapes, pure ballistics) share one map and one scarce resource. Undead caddy, necromantic Groundskeeper, dry-snarky tone. RPG battles/mini-games are shelved (PLAN v2, 2026-10-31).

**Read `PLAN.md` before doing anything.** It is the approved design + architecture + step plan (v2 designed 2026-10-31; v1 of 2026-08-29 lives in git history). Do not re-litigate locked decisions; open questions are in its Risks section.

## Status

- **P0 (scaffold) complete — 2026-08-29.** Vite+vitest scaffold; verbatim ink-links modules (rng/audio/effects/roughCache/style shell); `stage/physicsStage.ts` ported behind StageSpec/StageEvents with golden replay test; stack-based `scenes/sceneManager.ts`; DOM only via `ui/overlay.ts`. CI deploys to https://gregoryalan.github.io/hexlinks/ (Pages had to be enabled once via `gh api repos/.../pages -X POST -f build_type=workflow`).
- **P1 (walkable iso hex overworld) complete — 2026-09-01.** `hex/coords.ts` (axial math, iso projection y-squash 0.56 / 16 px per level, top-elevation-first picking), `hex/prism.ts` (side-face heights from neighbour deltas), `hex/path.ts` (A*: terrain costs, +1/level climb, >2-level cliffs block, ×2 in fog), `data/tutorial.ts` (hand-authored par-3 with relief, ASCII `<glyph><elev>` format in `hex/map.ts`), `data/fixtures.ts` (stair-step fixture), `render/hexRenderer.ts` (bake-once terrain + fog layers, per-frame occluder redraw so sprites pass behind raised ground), `render/camera.ts`, `input/gestures.ts` (tap/pan/pinch/wheel, headless-tested), `scenes/overworld.ts`, `state/run.ts`. Portrait viewport (canvas CSS size is the logical view). 43 tests green.
- **Art-risk decision (P1): flat fills + sparse rough.js scratch motifs, exactly the style board.** rough.js hachure faces were prototyped and rejected — they turn to grey mush at phone zoom and lose the board's paleness. Hachure remains behind `HexRenderer`'s `faceStyle: 'hachure'` option as the recorded fallback (`?style=hachure`). Fog = paper wash (coverage unioned, alpha scaled once — per-cell alpha double-washed side-face strips into diagonal bands) + one long mist scribble per cell. Painter's order is a plain (r, q) sort, proven exact for this projection in `tests/hex.test.ts` and eyeballed with `?debug=order` on the stair-step fixture.
- Playable: title → New Run → tutorial hole; tap a hex to walk (party + caddy stand-ins, camera follows), drag pans, pinch/wheel zooms. Review routes: `?proto=hole|stair`, `&fog=off`, `&style=hachure`, `&debug=order,cost,nomist,nowash`.
- **v2 pivot — 2026-10-31.** PLAN.md rewritten as the macro-Ledger × micro-Swing fun-test prototype (six steps, ~4 sessions). Battles, mini-games, tutorial beats, home base, meta-persistence shelved.
- **v2 steps 1a + 1b complete — 2026-10-31.** `shot/ballistics.ts` (pure 2.5D parabola vs heightfield: ridge/canopy strikes, gradient roll, ground shots for putter/bump-and-run, draw/fade, wind; `distHexes` is the Euclidean range unit — `hexDistance` runs ~15% long on vertical lines), `data/clubs.ts`, `rules/landing.ts`, `state/run.ts` (`beginRun`, `applyShot`, claimed ⊆ cleared, `shotSeed`), `scenes/overworld.ts` modes traverse/aim/flight/holed (tap-to-target aim, captured marker drag via `GestureRecognizer.shouldCapture`, club/shape/spin panel through `OverlayHost.panel`, corridor + dispersion-ring preview, flight animation with occluders, hole-out card), `?seed=`. Auto-perfect swing until the meter lands in step 2. 71 tests incl. ballistics goldens, seed sweep and a perfect-play hole-out invariant. Smoke script plays tee → aim → swing → walk (uses system Chrome via `CHROMIUM=`).
- **Next: step 2 — swing meter + spin/shape feel** (`shot/meter.ts`, `render/meterHud.ts`, meter read on raw pointer-down), then step 3 Ledger + daylight + nightfall. Epic #21 holds the step list.
- Update this Status section at the end of every build session: milestone reached, what's playable, next step. Close/update the matching GitHub issues and the milestone epic at the same time.
- **2026-09-11 audit:** P1 verified complete; live site == HEAD; backlog captured as GitHub issues #1–#25 (labels `bug/hygiene/tooling/agent-ready/decision/epic/risk`, milestones P2–P6). Pinned epic #21 is the P2 wave plan.

## Session startup

1. Read `PLAN.md` (at minimum: Locked decisions, Architecture, the current milestone's entry, Verification).
2. **The backlog is GitHub Issues** (epic #21 holds the v2 step list; `gh issue list` for the rest). Each issue's **Agent brief** section is written to be handed to a subagent in its own worktree. Reference issues in commits (`Fixes #N`). New findings become issues, never TODO comments.
3. Reference implementation lives at `~/code/ink-links` — read files there freely; never modify that repo from here. Known-good constants worth cribbing in later phases live in its `src/config.ts`: `BALLISTICS` (launchSpeed 36.0, gravity 0.26, airDrag 0.01 — measured matter outcomes, reverse-solved by its `tests/ballistics.test.ts`) and the `GEN` gate/retry numbers. Ported here already: PHYSICS, SHOT, SURFACES, BALL (mass pin `1.17559968`), maxDpr 2.
4. E2E smoke: `npm run dev`, then `SCRATCH=<scratchpad> CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/e2e-smoke.mjs` (playwright-core; no Playwright browser cache on this machine, system Chrome works; `BASE_URL=https://gregoryalan.github.io/hexlinks/` runs it against the live site). `scripts/e2e-art.mjs` shoots the art-review routes.

## Project rules

- **Layer discipline (enforced by convention, the #1 rule):** `core/ hex/ shot/ rules/ state/` import no DOM and no matter-js → `stage/` imports matter-js but no DOM → `scenes/` touch DOM only via SceneContext → only `main.ts`, `input/`, `render/` touch DOM/canvas. Everything below `scenes/` must run headless in vitest.
- **`Math.random` is banned.** All randomness goes through the seeded `Rng` interface (`core/rng.ts`); VFX use their own non-game xorshift stream (`render/effects.ts`).
- **Every tuning constant lives in `core/config.ts`**, commented, ink-links style. Numbers in PLAN.md marked [T] are first-pass guesses — tune freely, but only there.
- **Generation determinism:** anything that can reject-and-retry a seed (the holeGen gate) must be device-stable pure arithmetic — no Math.sin/cos in gates, no physics. Physics outcomes enter run state quantized (hex, integer damage), never raw floats.
- **Matter-js gotchas:** port `applySurface()` and friends from ink-links `src/physics.ts` with their comments; every static body creation goes through applySurface (matter 0.20 `Body.setStatic` silently overwrites materials on all `body.parts`).
- **Tests gate deploy.** Keep the ink-links archetypes: golden physics replay, golden generation snapshots, seed-sweep invariants, pure-reducer tests. `npm run build` must type-check (`tsc --noEmit`) first.
- **Commit at every green checkpoint; push promptly** (pushing is the backup strategy on this machine — no Time Machine).

## Verification quick reference

`npm test` (vitest, headless) → `npm run dev` + play on desktop and iPhone-width viewport → push to main → Pages workflow deploys (test-gated). E2E smoke scripts follow the ink-links `scripts/e2e-*.mjs` playwright-core pattern; screenshots go to the session scratchpad, never the repo.
