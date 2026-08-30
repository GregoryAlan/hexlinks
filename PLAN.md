# Hexlinks — Implementation Plan (new game, new repo)

## Context

Greg wants a new game fusing a golf overworld with an RPG encounter layer — "an RPG where the dungeon is a golf course." The idea was penciled out from `/Users/greg/code/ink-links`, his existing daily side-view slingshot physics golf game (vanilla TS + Vite + matter-js + rough.js, GitHub Pages). Ink Links serves as the reference for working physics-golf mechanics and hard-won engine patterns; the new game is a **new repo** that recycles only what isn't worth rebuilding. This plan is the deliverable of a design session (2026-08-29) and will be executed across later sessions, phase by phase.

## Locked decisions (from Greg)

- **Name/theme**: **hexlinks** (`~/code/hexlinks`) — double meaning: hex tiles AND hex curses. Undead/witchy/occult golf. Dry-snarky Golf Story-style writing. The caddy is **raised from the dead**; the antagonist Groundskeeper is a necromantic keeper of the course. Roguelike course modifiers are literal **Hexes** cast on the course. Backlog hook: ball flight paths inscribe sigil lines on the hex map that charge an overall hex spell (post-v1).
- **Concept**: player traverses a golf course "dungeon" between shots, overcoming random encounters and terrain challenges plus story beats, gaining exp/gear to upgrade shot and mini-game abilities.
- **Overworld**: **isometric 2.5D hex-tiled** course rendered on Canvas 2D — extruded hex prisms with **per-hex elevation** (surface relief), drawn back-to-front, keeping the rough.js hand-inked art. **Elevation affects gameplay from v1**: uphill/downhill carry, downhill roll-out, ridges block low-loft lines (blind shots into fog). Shots arc over the map via a slingshot aim/power swing; the player + caddy avatar then walks hex-to-hex to the ball. (Considered and rejected: flat top-down — no relief; three.js real 3D — large dep, kills the rough.js identity, little renderer reuse, mobile perf project.)
- **Cursed fog & path-carving (core mechanic)**: the course is blanketed in **cursed fog** that obscures detail (macro terrain silhouettes remain dimly visible; hex detail, hazard specifics, and pickups are hidden). **The ball's flight + roll path clears a corridor of fog**, and cleared hexes are where the party can safely walk — so every golf shot is also a route-carving decision. Shooting the long line over rough/trees clears a dangerous corridor you must then traverse; laying up along fairway carves a safe one. Story: the ball is blessed/enchanted and cuts the Groundskeeper's curse (the caddy explains it in the tutorial).
- **Hybrid shot resolution**: normal shots resolve on the overworld; hazard lies/landings launch **side-view matter-js mini-games** (bunker, water save, putt…) whose result determines the outcome. Ball-control mini-games modified by gear.
- **Traversal encounters**: terrain-weighted random encounters open **turn-based battles**: 2-character party — player attacks by physics slingshot golf shots at enemies (side-view), caddy takes menu-driven support turns. Battles grant exp.
- **Progression**: **gear, not creatures** — club set / ball / caddy item, upgradable; exp → levels → skill picks. **Persistent meta-progression** (Spire-lite): levels, skills, gear, coin, materials all persist at home base; HP/strokes reset per run.
- **Run identity**: **both hard limits** — a run ends on party wipe (one Caddy Save per run softens it) OR on blowing the stroke cap. Double pressure.
- **Art direction (chosen 2026-08-29)**: **"Overgrown Estate"** — Gorey-esque fine pen-and-ink on pale bone paper, grey daylight, dry aristocratic macabre (a once-grand course est. 1893 gone politely to seed; everyone is dead, or a goose, or both, and nobody remarks on it). House rules: pale fills with scratchy ink texture (terrain reads by texture first, hue second), one dried-blood red (#7d2a24) accent per scene, ink #2b2822 on bone #efeade, Fredericka the Great display + Georgia body. Fog = pen-scribble mist. Living style canvas: https://claude.ai/code/artifact/c7cb8a2e-24e5-4206-bb36-39f5ac4352b0 (page 1 is the house-style board; page 2 keeps the unchosen directions, raidable for parts). This register drives story/worldbuilding beats — Groundskeeper as estate keeper, club-noticeboard tone for UI copy.
- **Macro**: story-driven par-3 tutorial ("The Qualifying Hole") → unlock home base → roguelike seeded par-3 runs with a chosen Hex modifier. Par-9/18, deeper roguelike, story continue in later sessions.
- **V1 vertical slice**: tutorial hole (full loop, all systems taught) + minimal home base with run launcher, gear locker, workbench.

## Architecture (settled)

New repo, same stack as ink-links: vanilla TypeScript + Vite, canvas 2D, deps `matter-js`, `roughjs`, `seedrandom`, `poly-decomp`; dev `vitest`, `typescript`. No framework. Portrait orientation everywhere (overworld and side-view stages both ~portrait logical bounds) to avoid rotation prompts — decide stage aspect before P3.

**Layer discipline** (the #1 ink-links lesson, enforced by import convention): `core/hex/shot/rules/state` import no DOM and no matter-js → `stage/` imports matter-js but no DOM → `scenes/` touch DOM only via SceneContext → only `main.ts`, `input/`, `render/` touch DOM/canvas. This is what makes headless vitest tests and golden replays possible.

### Directory layout

```
src/
  core/      rng.ts (copy), vec.ts, config.ts (ALL tuning constants, ink-links convention), types.ts
  hex/       coords.ts, map.ts, path.ts (A*), holeGen.ts (seeded gen, gate/retry)
  shot/      ballistics.ts (pure overworld shot model, no matter-js)
  stage/     physicsStage.ts (generalized ink-links physics.ts), stageSpecs.ts (scenario builders)
  rules/     battle.ts (pure reducer), progression.ts, encounters.ts  ← game-systems math
  data/      clubs.ts, gear.ts, skills.ts, enemies.ts, encounters.ts, minigames.ts, hexes.ts, tutorial.ts
  scenes/    sceneManager.ts, homeBase.ts, overworld.ts, battle.ts,
             minigame/{bunkerBlast,readTheGreen,skimShot}.ts, dialogue.ts, reward.ts, runSummary.ts
  render/    camera.ts (NEW), hexRenderer.ts (NEW top-down bake), stageRenderer.ts (adapted),
             roughCache.ts (copy), effects.ts (copy)
  state/     save.ts (MetaSave reducers), run.ts (RunState reducers)
  input/     pointer.ts (adapted: slingshot drag + tap/pan/pinch)
  ui/        overlay.ts (DOM overlay helper — menus, dialogue)
  audio.ts (copy), main.ts, style.css (copy shell)
```

### Reuse from ink-links (`/Users/greg/code/ink-links`)

**Copy verbatim**: `src/rng.ts` (seeded Rng interface; Math.random banned project-wide), `src/audio.ts` (zero-asset WebAudio synth + iOS unlock), `src/render/effects.ts` (particles/shake, own xorshift32), `src/render/roughCache.ts` (FNV-1a-seeded Drawable cache — kills rough.js perf cost and "boiling"), `src/style.css` mobile shell, `vite.config.ts` (base './', es2022), `.github/workflows/deploy.yml` (npm ci → test → build → Pages OIDC), `poly-decomp.d.ts`.

**Adapt** (port these hard-won pieces with their comments):
- `src/physics.ts` → `stage/physicsStage.ts`: **applySurface()** (matter-js 0.20 `Body.setStatic` silently overwrites friction/restitution — re-apply to all `body.parts`), the `Bodies.fromVertices` re-centering fix, the winding-agnostic `pointInPolygon`, the `SURFACES` materials table, fixed-timestep accumulator (16ms, 100ms clamp) with `stepOnce()` for headless determinism, over-engineered rest detection (consecutive slow steps + support query + sleep).
- `src/input.ts` → `input/pointer.ts`: pointer-capture slingshot drag, injected `toLogical`, plus NEW tap / pan / pinch gestures.
- `src/storage.ts` → `state/save.ts`+`state/run.ts`: pure-reducer + injectable-Storage + merge-over-defaults pattern.
- `src/generation.ts` + `src/reachability.ts` → `hex/holeGen.ts` + `shot/ballistics.ts`: the **generate → cheap deterministic gate → retry with attempt salt** pattern, and the rule that the gate is device-stable pure arithmetic (rejection changes the seed, so the gate is part of generation).
- `src/render/renderer.ts` → three-layer canvas strategy (static bake / decals / per-frame dynamic).

**Drop for v1**: `daily.ts`, `share.ts`, solver worker (revisit later — the run launcher shows a shareable/re-enterable seed, ink-links-daily-style hook).

### Scene system (biggest net-new piece)

**Stack-based (push/pop), not a switcher** — flow is nested (overworld pushes battle, battle pushes reward, dialogue overlays anything). Results return synchronously on pop; push/pop requests made during `step()` are deferred to tick boundaries.

```ts
type SceneRequest = { kind:'overworld', hole, run } | { kind:'battle', encounter, party }
  | { kind:'minigame', game: MinigameKind, spec } | { kind:'dialogue', script }
  | { kind:'reward', rewards } | { kind:'runSummary', result } | { kind:'homeBase' };
type SceneResult  = { kind:'battle', outcome } | { kind:'minigame', outcome } | ...;
interface Scene { enter(ctx); resume(result); step(dtMs); render(g, view, alpha);
                  handlePointer(e); opaque: boolean; exit(); }
```

`main.ts` owns the single rAF loop + accumulator; steps the TOP scene only; renders the stack bottom-up skipping under-opaque scenes. Pointer events route to top scene only. Scenes owning bakes/physics create them in `enter()`, free in `exit()`. Canvas for the world, **DOM overlays for menus/dialogue** (`ui/overlay.ts`, ink-links innerHTML style) — isolate so a canvas-UI fallback stays contained. Manager is DOM-free → scene-flow tests run headless with a stub context.

Example flow: overworld shot lands in sand → ball rests on sand hex → next stroke from sand lie pushes `{kind:'minigame', game:'bunkerBlast'}` → scene runs its physics stage → pops outcome → overworld `resume()` places ball, updates RunState.

### Hex engine

- `hex/coords.ts`: axial `{q,r}`, pointy-top (holes run vertically, portrait), Red Blob-standard: `neighbors`, `hexDistance` (cube), `hexLine` (lerp+round), `hexRange`, `hexKey` ("q,r"), plus **isometric projection**: `axialToIso(h, elev)` (axial → world px with y-squash ≈ 0.58 and `−elev × ELEV_PX` vertical offset) and `isoPick(p, map)` (inverse picking that tests candidate cells top-elevation-first so raised hexes win the tap).
- `hex/map.ts`: `TerrainKind = 'tee'|'fairway'|'rough'|'deepRough'|'sand'|'water'|'trees'|'green'|'cartPath'|'oob'`; `HexCell {coord, terrain, elevation: int (0–6 [T]), modifiers}`; `HoleMap {seed, par, cells: Map<hexKey, HexCell>, tee, pin, worldBounds}`. Tutorial hole = hand-authored literal; roguelike holes from `holeGen.ts`.
- `hex/path.ts`: textbook A*, `TERRAIN_MOVE_COST` table in config (water/oob = ∞) plus an **elevation-step cost** (+1 per level climbed [T]; steps > 2 levels unwalkable → cliffs shape routes). Reused by the feasibility gate.
- `hex/holeGen.ts`: seed scheme `v1:{runSeed}:h{i}:a{attempt}`; **seeded heightfield first** (low-freq value noise, smoothed; green raised, water in lows, bunkers carved below their neighbors), then grow fairway corridor tee→pin along tolerable slopes, splash hazards, ring with rough/trees/oob → gate (A* path exists incl. elevation rules; pin reachable within par×maxCarry via ballistics arithmetic) → retry with attempt salt.
- `render/hexRenderer.ts`: **isometric prism renderer** — each cell drawn as rough.js top face (per-terrain fills: sand dots, water wavy hachure, green fine hachure, tree clusters) plus two visible side faces (flat darker inks, height = elevation delta to the lower neighbor), **painter's order back-to-front** (sort by iso depth `q+r`, then elevation), cached per `(terrain, elevation-silhouette, cellSeedHash)` via roughCache. **Bake whole hole once** into an offscreen canvas (terrain is static, so painter's-order cost is paid once); camera blits a subrect. Layers: bake / decals (trail, markers, flag) / dynamic (avatars, ball, aim UI, effects). Dynamic layer draws depth-sorted against cell positions so the ball/avatars pass correctly behind raised terrain; fog layer follows the same iso projection.
- `render/camera.ts` (net-new): `{center, zoom}` clamp [0.5, 1.25], `worldToScreen`/inverse (feeds input toLogical), bounds clamp, exp-smoothing follow. Side-view stages ignore the camera (fixed logical viewport, ctx.scale-to-fit). DPR cap 2 everywhere.

### Overworld shot model — `shot/ballistics.ts` (pure, no matter-js)

`resolveShot(input, hole, rng): ShotOutcome` — deterministic given seeded rng stream, golden-testable.
1. **Carry**: `club.range × powerCurve(power) × lieMult`; lateral dispersion `rng.range(±d)` scaled by scatter.
2. **Scatter**: `club.baseScatter × lie.scatterMult × (1 − accuracy) × gearMult`, sampled 2D gaussian → rounded to hex. Aim UI shows a live **scatter ring** so risk is always visible. No timing meter in v1 (accuracy is stat/gear-driven; sweet-spot release is a later hook).
3. **Elevation**: carry adjusted by tee-to-target height delta (−0.5 hex carry per level up, +0.5 down [T]); **ridge check** — a cell on the `hexLine` whose elevation exceeds the arc's height at that point blocks low-loft shots (deflect/drop short, like trees), making blind shots over ridges into fog a real play; roll-out follows downhill gradient (+1 cell per level down, uphill kills roll).
4. **Flight interruption**: trees on the `hexLine` with low/mid loft → 40% [T] canopy strike (drop/deflect).
5. **Landing rules in order**: water → offer Skim Shot vs drop (+1 stroke); off-map → +1 stroke, replay hex; fairway/green roll-out at power ≥ 80% [T] plus elevation gradient; sand/rough kill roll.
6. Emits cosmetic `flight` parabola samples (ball scale + offset shadow, iso-projected with elevation) for the arc animation + camera follow.
7. **Fog clearing**: `ShotOutcome.clearedPath: Axial[]` = the `hexLine` of the carry plus the roll path, widened by the ball's clear radius (base 1 hex each side [T]; gear can widen). Overworld `resume()` unions it into `RunState.clearedHexes`.

All multipliers flow through one ordered **Effect pipeline** (`base × lie × gear × skills × hexModifiers`) from day one.

### Cursed fog system

- **State**: `RunState.clearedHexes: Set<hexKey>`, seeded with a small radius around the tee at hole start. Fog never regrows in v1 (a regrowing-fog Hex modifier is a later hook).
- **Traversal rule (no softlocks)**: A* prefers cleared hexes; **fog hexes are enterable but hostile** — movement cost ×2 and encounter chance ×3 [T] ("pushing through the curse"). This makes carved corridors the strong default while guaranteeing the ball is always reachable even when the flight line crossed unwalkable terrain (e.g. water).
- **Visibility**: fogged hexes render as dim terrain-tinted silhouettes (macro layout readable, detail hidden — no hazard specifics, no pickups, encounter table hidden); cleared hexes render fully. Aim UI shows the projected clear corridor along with the scatter ring, so the routing trade-off is visible before committing the stroke.
- **Discovery reward hook**: fog can hide pickups (coin caches, materials) revealed when cleared — v1 ships 1–2 per hole to make line choice feel generous, not just risk management.
- **Rendering**: fog is its own incrementally-updated layer (exactly the ink-links trail-layer pattern, inverted): bake full-cover fog once, punch out cleared cells as shots resolve; composite between the terrain bake and the dynamic layer.
- **Gear/skill hooks**: Beacon Ball (+1 clear radius), caddy Lantern skill (clear a small radius around the party, once per hole), Groundskeeper Hexes that thicken fog (rates ×4 in fog) or start with pre-cleared "ley lines."

### Side-view physics stage

`createStage(spec: StageSpec, events): Stage` — generalized ink-links hole physics: `{bounds, terrain[{kind, verts}], ball, targets?, sensors?, gravity}`; events `onRest/onHit(targetId, impulse)/onSensor/onOutOfBounds`. `stage/stageSpecs.ts` builders: `bunkerBlastSpec(rng)`, `readTheGreenSpec(distance, rng)`, `skimShotSpec(rng)`, `battleArenaSpec(encounter, rng)`. Physics only *produces actions*; `rules/battle.ts` reducer (`battleReduce(state, action): state`, pure) owns all math. Battle/minigame outcomes enter run state **quantized** (hex, integer damage) — never raw floats — so nothing meta-critical depends on bit-exact cross-device physics.

### State & persistence

Two versioned localStorage slots via pure reducers (`hexlinks:meta`, `hexlinks:run`), a `migrate()` seam in `load()` from day one.
- **MetaSave** (persists): campaign progress, player/caddy levels + exp + skill picks, owned gear + tiers, loadout, coin, materials, unlocks, stats, settings.
- **RunState** (resets per run): run seed + type + chosen Hex, holeIndex, strokes/scorecard, ballHex + phase, `clearedHexes`, party HP/SP, Caddy Save availability, pity/encounter/karma counters.
- RNG for resume: fresh stream per event keyed `{seed}:h{i}:shot{n}` (avoids draw-counting fragility).

## Game systems (settled; all numbers tunable, live in config.ts)

### Core loop / stroke rules
`AIM_SHOT` (stroke counts at swing commit) → `RESOLVE_SHOT` (arc animation; landing may trigger/offer mini-game) → `TRAVERSE` (tap-to-path walk; each entered hex rolls encounter → `BATTLE`) → arrive at ball → repeat → `HOLE_OUT`. Mini-game and its stroke are one stroke; failed mini-game leaves ball in place, next attempt is a new stroke. Explicit penalty strokes only: water drop +1, OOB +1, battle loss +1 (campaign revive). Hole cap par+4 → pickup, score = cap. **Run ends (roguelike)** on party wipe (unless once-per-run Caddy Save: revive 30% HP, +2 strokes) OR on total-stroke blowout vs run cap. Campaign never ends the run (battle loss = +1 stroke, revive 50%). Green hole-out heals 25% max HP; birdie-or-better = +50% coin.

### Clubs (v1 bag of 4)
Driver 12–14 hexes / scatter 2.0 / low loft; Iron 6–9 / 1.2 / mid; Wedge 2–5 / 0.8 / high (halves rough+sand penalties, clears canopy); Putter 1–4 / 0.4 / ground (green only; ≤3 hexes from cup triggers putt mini-game). Lie table: tee 1.0×/0.75 scatter, fairway 1.0/1.0, rough 0.8/1.5, deep rough 0.6/2.0 (no driver), trees wedge-only max 2, cartPath 1.0/1.3 + free relief, sand → mini-game replaces swing.

### Mini-games (v1: 3 fully built)
- **Bunker Blast** (trigger: any stroke from sand lie): side-view bunker with lip; one slingshot over the lip into NEAR/GOOD/PERFECT landing bands → ball placed 0–5 hexes toward pin (PERFECT best); fail = stays in sand.
- **Read the Green** (trigger: putter within 3 hexes): seeded side-view green cross-section with slope humps; low-power roll into cup notch; gimme margin → auto tap-in next stroke.
- **Skim Shot** (trigger: water landing, player opts in over drop): ball falls in slow-mo; ONE mid-air re-hit (the ink-links perRest:2 signature) to skip off lily pads to the far bank — success avoids the penalty stroke entirely.
- Backlog (one-liners in plan history): Canopy Pinball (trees), Thresh (deep rough), Bounce Control (cartPath), Lag Putt Canyon, Gust Apex, Gopher Chase, Flop Wall. "Ball Karma" random-escalation hook ships **disabled** in v1 (flag exists).

### Battles
Side-view arena, terrain-flavored floor material. Turn order Player → Caddy → Enemies. Player: slingshot ball at enemies; `damage = clubBattlePower × clamp(impactSpeed/ref, 0.3, 1.5) × zoneMult × buffs`; body ×1.0, weak-spot ×2.0, graze ×0.5, miss = wasted turn. Club battle stats: Driver 12 heavy, Iron 9, Wedge 7 floaty, Putter 5 piercing. Caddy: SP pool (10 + 2/level), skills — Club Polish (2sp, +50% next shot), Bandage (3sp, heal 12), Fore! (2sp stun), Rake (2sp clear hazard), Read the Wind (1sp weak spots ×1.5 for 2 turns); free Cheer fallback. **Shared party HP v1** (Player 40+8/lvl, Caddy 30+6/lvl pooled; split-HP flagged as later hook). Flee: 100% − 15%/enemy alive; fail = free enemy attacks. Full-HP victory +25% exp.

**Enemy roster v1** (theme pass: undead/cursed flavor, dry-snarky names — final naming during P4): Gopher (20hp, burrows), Bunkerling→sand wraith (28hp, sand-patch hazard), Dew Wisp (18hp, aerial, damage debuff), Rough Tangler (35hp, binds caddy), Angry/Cursed Goose (45hp, rare, telegraphed charge, steals ball). Exp 8–22, coin + material drops per enemy (sandGrit, downFeather, pondPearl, gopherClaw, tangleFiber).

### Encounters
Per hex entered: tee/green/cartPath 0%, fairway 5%, sand 12%, rough 18%, trees 25%, deepRough 28%, water-adjacent +8%; **×3 in un-cleared fog**; terrain-weighted enemy tables, group size 1–2. **Pacing guards**: 3-step grace after any battle/hole start; pity ramp +4%/step after 6 safe steps; hard cap 3 encounters per stroke's traversal. The core traversal decision is now two-layered: which corridor your *shot* carves (terrain under the flight line), then whether to stay in it or push through fog for shortcuts/pickups.

### Progression & gear
Levels 1–5 v1 (exp 20/50/90/140); level = +HP, +2 SP, +1 skill point in Shot tree (Steady Hands +0.1 acc, Long Ball +1 range; stubs: Draw/Fade, Roll Reader) or Swing tree (Double Strike mid-air re-hit 1/battle, Power Slingshot +20% drag; stubs: Soft Touch, Sand Sense). Gear slots: **Club Set / Ball / Caddy item**; 9 v1 items (Starter/Forged Bag, Range/Floater/Gritless/Marked/**Beacon** Ball, Lucky Towel, First-Aid Satchel), tier 1→2 upgrades at the Workbench for coin + materials. Everything expressed via the shared `Effect {hook, value, condition}` pipeline — gear, skills, and Hexes all use it.

### Course Hexes (roguelike modifiers, v1: 3, pick 1 of 3 offered per run)
Goose Season (encounters +8%, goose ×3 weight, ×2 loot), Groundskeeper's Truce (rates halved, rewards halved), Cursed Sand (sand 30%, tougher wraiths, guaranteed grit). Pure `RunModifier` data through the Effect pipeline.

### Tutorial — "The Qualifying Hole" (par-3, 6–9 min)
Cast: silent Player, undead wisecracking Caddy (tutorializes everything), the Groundskeeper (necromantic antagonist cameo). Beats: (1) cold open at a **fog-drowned tee** — Caddy hands over the blessed Starter Bag and explains the ball cuts the curse; (2) forced first shot, rigged landing short of the bunker — **the corridor it clears is the reveal moment**; (3) walk the cleared path, encounters off, Caddy warns against stepping into the fog; (4) scripted Gopher battle — attack, weak spot, one caddy turn, rewards; (5) free second shot with two viable carve lines (safe fairway lay-up vs bold rough line past a revealed coin cache), then the Groundskeeper's wind **rigs it into the bunker**; (6) Bunker Blast with a free tutorial retry; (7) walk to green — optional fog-shortcut temptation teaches the ×3 fog danger; (8) Read the Green putt, forgiving; (9) hole-out, cleared corridors glow across the map as a proto-sigil, Groundskeeper hook line, **unlock Home Base**. Dialogue = flat `DialogueLine[]` data keyed by beat, no cutscene engine.

### Home base (v1)
One static screen (theme pass: the Groundskeeper's old shed/clubhouse porch): **Tee Box** (launch Par-3 Sprint: seeded, shows shareable seed, pick 1 of 3 Hexes), **Gear Locker** (equip 3 slots), **Workbench** (upgrades + skill point spending). Locked stubs visible: Trophy Shelf, Practice Range.

### Data tables to type in (all in `src/data/`)
4 ClubDef, 9 GearItem, 5 Skill, 5 Enemy, 7 EncounterTable rows, 3 MiniGameSpec, 3 RunModifier (Hexes), ~30 DialogueLines, fog constants (clear radius, fog cost/encounter multipliers, tee reveal radius). Full TS shapes (`Effect`, `Enemy`, `MiniGameSpec`, `RunConfig`, `MetaSave`/`RunState`) are sketched in the sections above and in `core/types.ts`.

## Art workstream (Claude Design)

Use the **Claude Design skill** (`/design`) as the art-direction tool, running alongside the code milestones:

- **Style canvas — STARTED, direction chosen**: the canvas exists at https://claude.ai/code/artifact/c7cb8a2e-24e5-4206-bb36-39f5ac4352b0 with the chosen "Overgrown Estate" house-style board (all 10 terrain swatches, fog treatment, cast sprites for Caddy/Groundskeeper/goose, voice sample, palette + type + house rules — see Locked decisions). Remaining before/during P1: elevation/cliff prism treatment at 2–3 heights, a full iso mock of the tutorial hole with relief. The approved board is the target the procedural rough.js hexRenderer matches (colors → `config.ts` COLORS, motifs → procedural draw code).
- **Character canvas (before P4)**: character sheets — undead Caddy, the Groundskeeper, and the 5 enemies (idle + hit poses, weak-spot callouts). **Hybrid asset decision**: terrain/effects stay 100% procedural (ink-links doctrine), but characters/enemies export from the canvas as PNG sprites into `public/sprites/` — a small deliberate asset pipeline (preload + drawImage in stage/overworld renderers), the one place procedural drawing isn't worth the pain.
- **UI canvas (before P4/P6)**: mockups for home base, battle layout + caddy command menu, aim UI (scatter ring + clear-corridor preview), dialogue box, reward/run-summary screens — implemented as DOM overlays / canvas per the mockups.
- Keep each canvas as a living artifact (re-seed/update as the game evolves); export PNG references into the repo under `design/` for offline reference.

## Phased milestones (each ends playable/testable; execute one or two per session)

- **P0 — Scaffold (S)**: repo `~/code/hexlinks`, Vite+vitest, copy verbatim modules, port `physicsStage.ts` + golden replay test, `sceneManager.ts` + stub homeBase, main loop, CI → Pages green. *(Per machine conventions: repo under ~/code, push promptly after commits.)*
- **P1 — Walkable iso hex overworld (M/L)**: hex math + iso projection/picking + tests, hand-authored tutorial HoleMap **with elevation**, iso prism renderer bake (painter's order), **fog layer** (full-cover bake, punch-out clearing, dim-silhouette fogged rendering), camera pan/zoom, tap-a-hex → A* walk with fog + elevation movement costs. **Prototype the rough.js iso-prism art AND fog legibility here; fall back to flat fills + rough outlines if hachure faces don't read.**
- **P2 — Overworld shots (M/L)**: `ballistics.ts` + goldens (incl. `clearedPath` and elevation carry/ridge/roll rules), aim mode (slingshot + scatter ring + **projected clear-corridor preview** + club picker), iso arc animation + camera follow, landing rules, fog union into RunState, fog-hidden pickups, hole-out to stub summary. Playable par-3 with carve-your-route over relief.
- **P3 — Mini-games (M)**: stageSpecs + Read the Green (closest wholesale ink-links reuse) then Bunker Blast; hybrid resolution loop complete. Decide stage aspect (portrait) before building.
- **P4 — Battles (L)**: encounter rolls during traversal, battle scene (arena stage + slingshot attacks + DOM caddy menu), `rules/battle.ts` reducer + tests, reward overlay, exp/loot to meta. Enemy naming/theme pass here.
- **P5 — Tutorial stitched (M)**: dialogue overlay + `data/tutorial.ts`, scripted beats (rigged shots, scripted battle), level-up presentation, Skim Shot, full-flow headless smoke test.
- **P6 — Home base + roguelike loop (S/M)**: home base scene, `holeGen.ts` seeded par-3 + gate/retry + seed-sweep tests, Hex pick, beginRun/endRun reducers, run summary → meta rewards → base. **V1 slice done.**

## Verification

- **Unit/headless (vitest, gates deploy in CI)**: hex math property tests (distance, iso-project↔pick roundtrip incl. elevated cells, line contiguity); A* invariants (incl. cliff rules); ballistics goldens + invariants; holeGen seed-sweep (path always exists, pin on green) + golden HoleMap snapshot; golden physics replay through `stepOnce()` (guards matter workarounds); pure-reducer tests for save/run/battle; scene-manager push/pop/resume tests; P5 full-flow tutorial smoke test.
- **Manual/E2E**: `npm run dev` + play each phase's deliverable on desktop + iPhone Safari; port ink-links' playwright-core E2E scripts (`scripts/e2e-*.mjs` pattern, 390×780 viewport, console-error capture, scratchpad screenshots) for drag-gesture smoke runs.
- **Deploy**: push to main → Pages workflow (test-gated) → verify live URL.

## Open risks (watch during execution)

1. **Pan vs slingshot gesture conflict** — explicit modes (traverse: drag pans / tap walks; aim: entered via ball tap, drag captured, camera locked). Validate feel on touch in P2.
2. **rough.js iso-prism legibility** — art risk, prototyped P1 with a flat-fill fallback. Iso adds two sub-risks: painter's-order bugs at cliff edges (bake-once keeps the cost contained; test with a stair-step fixture map), and dynamic-layer depth sorting (ball/avatar behind raised terrain) — keep a simple `q+r+elev` sort key and a debug toggle that outlines draw order.
3. **Bake size at par-9/18** — fine for par-3; don't hardcode one-bake-one-canvas deep in the renderer.
4. **DOM overlay vs canvas UI** — DOM first; all overlay code isolated in `ui/overlay.ts` for a contained swap.
5. **Cross-device float drift** — quantize all physics outcomes entering run state; goldens pinned to CI.
6. **Fog balance** — if corridors feel like the only sane route, holes play linear; the ×3-fog/×2-cost numbers, fog pickups, and scatter (which widens corridors unpredictably) are the tuning levers. Watch in P2 playtests. Scatter interaction note: the ball clears fog along its *actual* (scattered) path, so a mishit still opens *a* route — never a dead end.

## Key reference files (ink-links)

`src/physics.ts` (applySurface + matter gotchas, rest detection, timestep), `src/generation.ts` + `src/reachability.ts` (gate/retry + pure-arithmetic gate), `src/storage.ts` (reducer save pattern), `src/render/renderer.ts` + `roughCache.ts` (bake strategy + Drawable cache), `src/input.ts`, `src/config.ts` (tuning-constants convention + known-good SHOT/SURFACES/PHYSICS values), `src/rng.ts`, `src/audio.ts`, `.github/workflows/deploy.yml`.
