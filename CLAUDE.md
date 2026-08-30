# hexlinks

A golf-RPG where the dungeon is a golf course. Isometric 2.5D hex overworld with cursed-fog path-carving; side-view matter-js mini-games and turn-based slingshot battles; undead caddy, necromantic Groundskeeper, dry-snarky tone.

**Read `PLAN.md` before doing anything.** It is the approved design + architecture + milestone plan (designed 2026-08-29). Do not re-litigate decisions marked as locked; open questions are listed in its Risks section.

## Status

- **Current milestone: P0 (scaffold) — not started.** Nothing exists yet but this file, PLAN.md, and BOOTSTRAP.md.
- Update this Status section at the end of every build session: milestone reached, what's playable, next step.

## Session startup

1. Read `PLAN.md` (at minimum: Locked decisions, Architecture, the current milestone's entry, Verification).
2. Read `BOOTSTRAP.md` for the P0 checklist and the exact ink-links reuse map. Delete BOOTSTRAP.md once P0 is complete and fold anything still relevant here.
3. Reference implementation lives at `~/code/ink-links` — read files there freely; never modify that repo from here.

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
