# hexlinks

A golf-RPG where the dungeon is a golf course. Isometric 2.5D hex overworld with cursed-fog path-carving; side-view matter-js mini-games and turn-based slingshot battles; undead caddy, necromantic Groundskeeper, dry-snarky tone.

**Read `PLAN.md` before doing anything.** It is the approved design + architecture + milestone plan (designed 2026-08-29). Do not re-litigate decisions marked as locked; open questions are listed in its Risks section.

## Status

- **P0 (scaffold) complete — 2026-08-29.** Vite+vitest scaffold; verbatim ink-links modules (rng/audio/effects/roughCache/style shell); `stage/physicsStage.ts` ported behind StageSpec/StageEvents with golden replay test; stack-based `scenes/sceneManager.ts`; DOM only via `ui/overlay.ts`. CI deploys to https://gregoryalan.github.io/hexlinks/ (Pages had to be enabled once via `gh api repos/.../pages -X POST -f build_type=workflow`).
- **P1 (walkable iso hex overworld) complete — 2026-09-01.** `hex/coords.ts` (axial math, iso projection y-squash 0.56 / 16 px per level, top-elevation-first picking), `hex/prism.ts` (side-face heights from neighbour deltas), `hex/path.ts` (A*: terrain costs, +1/level climb, >2-level cliffs block, ×2 in fog), `data/tutorial.ts` (hand-authored par-3 with relief, ASCII `<glyph><elev>` format in `hex/map.ts`), `data/fixtures.ts` (stair-step fixture), `render/hexRenderer.ts` (bake-once terrain + fog layers, per-frame occluder redraw so sprites pass behind raised ground), `render/camera.ts`, `input/gestures.ts` (tap/pan/pinch/wheel, headless-tested), `scenes/overworld.ts`, `state/run.ts`. Portrait viewport (canvas CSS size is the logical view). 43 tests green.
- **Art-risk decision (P1): flat fills + sparse rough.js scratch motifs, exactly the style board.** rough.js hachure faces were prototyped and rejected — they turn to grey mush at phone zoom and lose the board's paleness. Hachure remains behind `HexRenderer`'s `faceStyle: 'hachure'` option as the recorded fallback (`?style=hachure`). Fog = paper wash (coverage unioned, alpha scaled once — per-cell alpha double-washed side-face strips into diagonal bands) + one long mist scribble per cell. Painter's order is a plain (r, q) sort, proven exact for this projection in `tests/hex.test.ts` and eyeballed with `?debug=order` on the stair-step fixture.
- Playable: title → New Run → tutorial hole; tap a hex to walk (party + caddy stand-ins, camera follows), drag pans, pinch/wheel zooms. Review routes: `?proto=hole|stair`, `&fog=off`, `&style=hachure`, `&debug=order,cost,nomist,nowash`.
- **Next: P2 — overworld shots.** `shot/ballistics.ts` + goldens (carry/scatter/elevation/ridge/roll/`clearedPath`), aim mode (slingshot + scatter ring + corridor preview + club picker), iso arc animation, landing rules, fog union via `OverworldScene.markFogDirty()` + `state/run.ts clearHexes`, hole-out to stub summary. Style canvas still lists "elevation/cliff treatment" as a to-do — the renderer is now the treatment; consider exporting a reference shot to the canvas.
- Update this Status section at the end of every build session: milestone reached, what's playable, next step.

## Session startup

1. Read `PLAN.md` (at minimum: Locked decisions, Architecture, the current milestone's entry, Verification).
2. Reference implementation lives at `~/code/ink-links` — read files there freely; never modify that repo from here. Known-good constants worth cribbing in later phases live in its `src/config.ts`: `BALLISTICS` (launchSpeed 36.0, gravity 0.26, airDrag 0.01 — measured matter outcomes, reverse-solved by its `tests/ballistics.test.ts`) and the `GEN` gate/retry numbers. Ported here already: PHYSICS, SHOT, SURFACES, BALL (mass pin `1.17559968`), maxDpr 2.
3. E2E smoke: `npm run dev`, then `SCRATCH=<scratchpad> node scripts/e2e-smoke.mjs` (playwright-core, uses the cached Chromium; override with `CHROMIUM=<path>`; `BASE_URL=https://gregoryalan.github.io/hexlinks/` runs it against the live site). `scripts/e2e-art.mjs` shoots the art-review routes.

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
