# P0 Bootstrap — first build session checklist

Goal (from PLAN.md P0): repo scaffolded, verbatim modules copied, physics stage ported with its golden replay test, scene manager + stub home base, main loop, CI deploying green to Pages. Delete this file when P0 is done (fold leftovers into CLAUDE.md).

## 1. Scaffold

```sh
cd ~/code/hexlinks
npm init -y                      # name: hexlinks, private: true
npm i matter-js roughjs seedrandom poly-decomp
npm i -D typescript vite vitest @types/matter-js @types/seedrandom
```

Scripts (mirror ink-links exactly):

```json
"test": "vitest run",
"dev": "vite",
"build": "tsc --noEmit && vite build",
"preview": "vite preview"
```

`.gitignore`: `node_modules/`, `dist/`.

## 2. Copy VERBATIM from ~/code/ink-links (then adjust imports only)

| From (ink-links) | To (hexlinks) | Note |
|---|---|---|
| `src/rng.ts` | `src/core/rng.ts` | unchanged |
| `src/audio.ts` | `src/audio.ts` | unchanged; SFX map will grow later |
| `src/render/effects.ts` | `src/render/effects.ts` | unchanged |
| `src/render/roughCache.ts` | `src/render/roughCache.ts` | unchanged |
| `src/style.css` | `src/style.css` | keep mobile shell (touch-action none, safe areas, dvh clamp); palette changes later with the style canvas |
| `vite.config.ts` | `vite.config.ts` | unchanged (base './', es2022) |
| `tsconfig.json` | `tsconfig.json` | unchanged (strict, noEmit) |
| `poly-decomp.d.ts` | `src/poly-decomp.d.ts` | unchanged |
| `.github/workflows/deploy.yml` | same path | unchanged (npm ci → test → build → Pages OIDC, `enablement: true`) |
| `index.html` | `index.html` | same skeleton: one canvas, `#hud`, `#overlay-root`; retitle |

## 3. Port with intent (P0 scope)

- `src/physics.ts` → `src/stage/physicsStage.ts`: generalize `createHolePhysics(spec)` → `createStage(spec: StageSpec, events)` per PLAN.md §Side-view physics stage. **Carry over with their comments:** `applySurface()`, the `Bodies.fromVertices` re-centering fix, winding-agnostic `pointInPolygon`, `SURFACES` table (→ `core/config.ts`), fixed-timestep accumulator + `stepOnce()`, the over-engineered rest detection (restSteps + isSupported + Sleeping).
- Golden replay test: adapt `tests/replay.test.ts` — build a trivial StageSpec (flat floor + ball), scripted shots via `stepOnce()`, snapshot positions to 2 decimals. This is the guard that the port didn't change physics.
- `src/scenes/sceneManager.ts`: new, per PLAN.md §Scene system (stack, deferred push/pop, SceneRequest/SceneResult unions, `opaque` flag). Unit tests with a stub SceneContext.
- `src/scenes/homeBase.ts`: stub — title + "New Run" button (DOM overlay) that pushes a placeholder scene.
- `src/main.ts`: rAF loop + accumulator (ink-links `main.ts:177` pattern), hosts the scene manager, DPR-capped canvas sizing (crib from `src/render/renderer.ts` resize + `toLogical`).

## 4. Ship P0

```sh
git add -A && git commit -m "P0: scaffold, verbatim ink-links modules, physics stage port, scene manager"
gh repo create GregoryAlan/hexlinks --public --source=. --push   # confirm visibility with Greg if unsure
```

Then verify the Pages workflow runs green and the live URL loads the stub home base. Ink-links gotcha from launch (see ink-links provenance memory): the workflow uses `configure-pages` with `enablement: true`, but if the first deploy fails, check the repo's Pages settings and the gh token's `workflow` scope.

## 5. Known-good constants to crib when needed (later phases)

From ink-links `src/config.ts`: `PHYSICS` (stepMs 16, maxFrameMs 100), `SHOT` (forceScale 0.16, min/max drag px, perRest 2 — the mid-air re-hit that becomes Skim Shot / Double Strike), `SURFACES` (normal/ice/sand/wall/green friction+restitution), `BALLISTICS` (launchSpeed 36.0, gravity 0.26, airDrag 0.01 — measured matter outcomes; reverse-solved by `tests/ballistics.test.ts`), ball mass pin `1.17559968`, `WORLD.maxDpr = 2`.

## First-session suggestion

P0 is small (S). If it goes fast, roll straight into P1 (iso hex overworld) — the art-risk prototype (rough.js iso prisms + fog legibility) is the thing most worth seeing early. The art direction is already chosen and the style canvas exists (see PLAN.md "Art direction" under Locked decisions — the P1 prototype renders toward that board; check the canvas for any edits Greg saved since).
