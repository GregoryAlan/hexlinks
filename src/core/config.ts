// Every tuning constant in the game lives here (ink-links convention).
// Values marked "ref" are ported verbatim from ink-links, which had known-good
// feel; values marked [T] are first-pass guesses from PLAN.md — tune freely,
// but only here.

export const WORLD = {
  /** Backing-store DPR cap — 3x canvases blow memory on iPhones for no
   *  visible gain at this art style. */
  maxDpr: 2,
} as const;

/** Side-view stage logical bounds. Portrait-ish everywhere per PLAN.md; the
 *  final stage aspect is decided before P3 — P0 keeps the ink-links square. */
export const STAGE = {
  width: 2200, // ref (ink-links WORLD.size)
  height: 2200,
} as const;

export const BALL = {
  radius: 20, // ref
  restitution: 0, // ref — bounciness comes from surfaces
  friction: 1, // ref
  density: 0.004, // ref
  mass: 1.17559968, // ref — mass pinned so force scaling is stable
} as const;

export const SHOT = {
  minDragPx: 25, // ref — power floor, prevents accidental taps
  maxDragPx: 400, // ref — max-power clamp (logical px)
  forceScale: 0.16, // ref — force magnitude at full power
  /** Shots available per rest-cycle; >1 enables the signature mid-air hit
   *  (becomes Skim Shot / Double Strike here). */
  perRest: 2, // ref ("bombCount")
} as const;

export const PHYSICS = {
  stepMs: 16, // ref — fixed timestep, 62.5 Hz
  maxFrameMs: 100, // clamp long frames (tab switch) so we don't spiral
  /** Rest detection thresholds (ref): vx^2 < restVx2 && vy^2 < restVy2. */
  restVx2: 0.001,
  restVy2: 0.0001,
  /** Consecutive slow steps required — a vertical shot's apex only stays
   *  slow for ~1 step, a grounded ball stays slow forever. */
  restSteps: 5,
  /** Sensor triggers require a near-stopped ball (ref "sink"): both velocity
   *  components^2 below this. */
  sensorV2: 0.001,
} as const;

/** Side-view stage surface materials. ink-links' known-good values; 'ice'
 *  kept as-is for now (likely becomes a cursed/frost variant later). */
export type SurfaceKind = 'normal' | 'ice' | 'sand' | 'wall' | 'green';

export const SURFACES: Record<SurfaceKind, { restitution: number; friction: number }> = {
  normal: { restitution: 0.4, friction: 0.01 }, // ref
  ice: { restitution: 0.75, friction: 0.003 }, // ref
  sand: { restitution: 0.1, friction: 0.09 }, // ref
  wall: { restitution: 0.5, friction: 0 }, // ref
  green: { restitution: 0.4, friction: 0.01 }, // ref
};

/** "Overgrown Estate" palette (style canvas, Locked decisions in PLAN.md):
 *  ink on bone paper, pale fills that read by texture first, ONE dried-blood
 *  red accent per scene. P0 carries only the anchors plus the surface-kind
 *  slots roughCache needs; the real terrain palette lands with the P1
 *  hexRenderer, matched against the style board. */
export const COLORS = {
  paper: '#efeade', // bone
  ink: '#2b2822',
  accent: '#7d2a24', // dried-blood red — the one accent
  muted: '#8f887a',
  // Surface-kind fills for the side-view stage (placeholder pale-ink pass).
  platformFill: '#e3dcc9',
  platformStroke: '#2b2822',
  iceFill: '#dfe4e0',
  iceStroke: '#4a5350',
  sandFill: '#e6dbbd',
  sandStroke: '#6f5f3d',
  greenFill: '#d9ddc4',
  greenStroke: '#2b2822',
  ball: '#2b2822',
  ballOutline: '#efeade',
  aim: '#7d2a24',
  aimSpent: '#8f887a',
} as const;

export const GAME_NAME = 'Hexlinks';

// ---- P1: iso hex overworld ---------------------------------------------------

/** Hex grid + isometric projection. Pointy-top axial grid (holes run
 *  vertically, portrait). The "iso" view is the flat top-down grid with its y
 *  axis squashed and elevation lifting cells straight up the screen — a
 *  dimetric look that keeps every top face the same hexagon (one cached
 *  drawable per terrain/elevation silhouette) and makes painter's order a
 *  plain row sort. Numbers match the style board's prism sketches. */
export const HEX = {
  /** Circumradius in flat-world px. Board prisms are 72.8 px wide →
   *  size 42 (width = size·√3). */
  size: 42,
  /** Screen-y per flat-world-y. Board: 47 px tall hex for a 72.8 px wide one
   *  → 0.56. Anything much flatter loses the side faces; much taller reads
   *  top-down. */
  ySquash: 0.56,
  /** Screen px of lift per elevation level. Board raises the green ~18 px
   *  for what reads as a one-level tier; 16 keeps a 6-level cliff (96 px) under
   *  three rows of overlap. [T] */
  elevPx: 16,
  maxElevation: 6,
} as const;

/** Iso prism art (style board "Overgrown Estate"). Ink stays 0.6–1.6 px at
 *  zoom 1; fills stay pale; terrain reads by texture first. */
export const HEX_ART = {
  /** Top-face outline. */
  inkWidth: 1.3,
  /** Side-face outline + motif strokes. */
  sideInkWidth: 1.1,
  scratchWidth: 0.7,
  scratchAlpha: 0.55,
  /** rough.js roughness for outlines — low: the board's linework is steady,
   *  just hand-drawn. */
  roughness: 0.7,
  /** Backing px per flat-world px in the bake. 2 keeps 1.25× zoom on a 2×
   *  DPR phone crisp; bake canvases are ~1.8k px square for a par-3. */
  bakeScale: 2,
  /** Fogged cells: the whole prism is knocked back toward the paper by this
   *  alpha of paper wash, then scribble mist goes over the top. Board shows
   *  fogged prisms at ~0.3 opacity. */
  fogWashAlpha: 0.6,
  fogMistAlpha: 0.32,
  /** Mist scribbles: every fogged cell gets one long sweep, and a second
   *  with this probability — sparse, so the macro silhouettes stay legible
   *  underneath (the prototype's 3-per-cell read as a brick wall). */
  fogMistSecondChance: 0.35,
  /** Side-face height (px) shown on map-edge cells with no neighbour under
   *  the edge — the "board" lip that makes ground-level tiles read as tiles. */
  edgeLipPx: 10,
} as const;

/** Overworld camera: zoom = screen CSS px per flat-world px. */
export const CAMERA = {
  minZoom: 0.5,
  maxZoom: 1.25,
  /** Exp-smoothing follow rate (per second). */
  followRate: 6,
  /** World-bounds padding so the map edge can reach the viewport center. */
  padPx: 120,
} as const;

/** Gesture recognition (logical CSS px / ms). */
export const GESTURE = {
  /** Movement under this is a tap, not a pan. */
  tapSlopPx: 8,
  tapMaxMs: 350,
} as const;

/** Traversal costs (PLAN.md §Hex engine / §Cursed fog). A* minimizes the sum
 *  of per-hex-entered costs. */
export const TERRAIN_MOVE_COST = {
  tee: 1,
  fairway: 1,
  cartPath: 1,
  green: 1,
  rough: 2,
  sand: 2,
  deepRough: 3,
  trees: 3,
  water: Infinity,
  oob: Infinity,
} as const;

export const MOVE = {
  /** Extra cost per elevation level climbed (descending is free). [T] */
  climbCostPerLevel: 1,
  /** Steps of more than this many levels (either direction) are cliffs —
   *  unwalkable, so ridges shape routes. [T] */
  maxStepLevels: 2,
  /** Entering an un-cleared (fogged) hex: cost multiplier. [T] */
  fogCostMult: 2,
  /** Fog cleared around the tee at hole start (hex radius). [T] */
  teeRevealRadius: 2,
  /** Walk animation: ms per hex entered (scaled by terrain cost a bit). */
  walkMsPerHex: 180,
} as const;

/** Terrain palette straight off the style board's swatches (pale fills,
 *  texture carries the read). Side faces are one warm paper-shadow tone. */
export const TERRAIN_COLORS = {
  tee: '#c3cbb0',
  fairway: '#b9c2a4',
  rough: '#a8a58c',
  deepRough: '#918e74',
  sand: '#dccda6',
  water: '#b7c2c4',
  trees: '#8a9a7e',
  green: '#97a982',
  cartPath: '#d8d2bf',
  oob: '#e7e1d0',
} as const;

export const ISO_COLORS = {
  side: '#ddd5c0',
  /** Shadowed (south-east) side face, one step darker so the prism turns. */
  sideDark: '#cfc6ae',
  canopy: '#7f9070',
  groundPaper: '#e7e1d0',
  pathDot: '#6b6455',
  ball: '#f7f3e8',
  fogMist: '#2b2822',
  pathMark: '#7d2a24',
} as const;

// ---- v2: the Swing (pure shot model) ------------------------------------------

/** Clubs. Distances are in hexes (centre to centre), apex heights in
 *  elevation levels — the same units the heightfield uses, so a ridge check
 *  is a plain comparison. `dispersion` is the lateral miss in hexes at a
 *  full-width accuracy error; `sweetSpotWidth` scales the meter's sweet band.
 *  `loft 0` marks a ground shot (putter): the ball rolls, never flies. [T] */
export const CLUBS = {
  driver: { name: 'Driver', maxCarry: 12, loft: 2.0, rollFactor: 3.0, dispersion: 1.6, sweetSpotWidth: 0.8, shapes: ['standard', 'punch'], price: 0 },
  hybrid: { name: 'Hybrid', maxCarry: 10, loft: 2.5, rollFactor: 2.0, dispersion: 1.3, sweetSpotWidth: 0.9, shapes: ['standard', 'punch'], price: 12 },
  iron: { name: 'Iron', maxCarry: 8, loft: 3.0, rollFactor: 1.5, dispersion: 1.0, sweetSpotWidth: 1.0, shapes: ['standard', 'punch', 'bumpRun'], price: 0 },
  wedge: { name: 'Wedge', maxCarry: 5, loft: 4.0, rollFactor: 0.5, dispersion: 0.7, sweetSpotWidth: 1.1, shapes: ['standard', 'flop', 'bumpRun'], price: 0 },
  lobWedge: { name: 'Lob wedge', maxCarry: 3.5, loft: 5.5, rollFactor: 0, dispersion: 0.6, sweetSpotWidth: 1.0, shapes: ['standard', 'flop'], price: 10 },
  putter: { name: 'Putter', maxCarry: 4, loft: 0, rollFactor: 0, dispersion: 0.35, sweetSpotWidth: 1.3, shapes: ['standard'], price: 0 },
} as const;

/** Starting bag. */
export const START_BAG = ['driver', 'iron', 'wedge', 'putter'] as const;

/** Shot shapes multiply the club. `apex` scales loft (how high the arc
 *  goes), `range` the carry, `roll` the roll-out, `disp` the dispersion,
 *  `canopyStrike` the chance a tree hex under the flight catches the ball.
 *  bumpRun is a ground shot like the putter. [T] */
export const SHAPES = {
  standard: { range: 1.0, apex: 1.0, roll: 1.0, disp: 1.0, canopyStrike: 0.4 },
  punch: { range: 0.85, apex: 0.5, roll: 1.8, disp: 0.9, canopyStrike: 0.1 },
  flop: { range: 0.6, apex: 1.8, roll: 0, disp: 1.3, canopyStrike: 0.5 },
  bumpRun: { range: 0.8, apex: 0, roll: 1.0, disp: 0.8, canopyStrike: 0 },
} as const;

export const SPIN = {
  /** Back spin ×(1−rollDelta) roll, top spin ×(1+rollDelta). */
  rollDelta: 0.5,
  /** Draw/fade: lateral curve in hexes at the end of a full carry
   *  (quadratic in flight fraction, so it bends late). */
  curveHexes: 1.5,
  /** Shaping the shot narrows the meter's sweet band (step 2). */
  curveSweetMult: 0.7,
} as const;

/** Lie table by the terrain the ball sits on. `carry` and `disp` multiply
 *  the club; `sweep`/`sweet` reach the meter in step 2; `bannedClubs` can't
 *  be selected from that lie; `noise` is the seeded lie-noise amplitude in
 *  hexes (small — the meter is the main source of error). [T] */
export const LIE = {
  tee: { carry: 1.0, disp: 0.75, sweep: 1.0, sweet: 1.1, noise: 0.1, bannedClubs: [] },
  fairway: { carry: 1.0, disp: 1.0, sweep: 1.0, sweet: 1.0, noise: 0.15, bannedClubs: [] },
  green: { carry: 1.0, disp: 1.0, sweep: 1.0, sweet: 1.0, noise: 0.1, bannedClubs: ['driver'] },
  cartPath: { carry: 1.0, disp: 1.3, sweep: 1.1, sweet: 0.9, noise: 0.3, bannedClubs: [] },
  rough: { carry: 0.85, disp: 1.4, sweep: 1.15, sweet: 0.8, noise: 0.3, bannedClubs: [] },
  deepRough: { carry: 0.65, disp: 1.9, sweep: 1.3, sweet: 0.6, noise: 0.4, bannedClubs: ['driver', 'hybrid'] },
  sand: { carry: 0.7, disp: 1.6, sweep: 1.2, sweet: 0.7, noise: 0.35, bannedClubs: ['driver', 'hybrid', 'putter'] },
  trees: { carry: 0.5, disp: 2.0, sweep: 1.3, sweet: 0.6, noise: 0.4, bannedClubs: ['driver', 'hybrid', 'putter'] },
  water: { carry: 0, disp: 1, sweep: 1, sweet: 1, noise: 0, bannedClubs: [] },
  oob: { carry: 0, disp: 1, sweep: 1, sweet: 1, noise: 0, bannedClubs: [] },
} as const;

/** Roll-out multiplier by the terrain the ball lands on. 0 kills roll. */
export const ROLL_MULT = {
  tee: 1.0,
  fairway: 1.0,
  green: 1.3,
  cartPath: 1.6,
  rough: 0.4,
  deepRough: 0,
  sand: 0,
  trees: 0,
  water: 0,
  oob: 0,
} as const;

/** Flight model (`shot/ballistics.ts`). The arc is a parabola in (hexes
 *  along the line, elevation levels up); it keeps flying past the intended
 *  carry until it meets ground, so downhill shots run long and uphill ones
 *  land short with no fudge constants. */
export const BALLISTICS = {
  /** Flight samples per hex of carry (≥4 keeps the corridor contiguous on
   *  diagonals). */
  samplesPerHex: 4,
  /** Apex at zero power is this fraction of the full-power apex. */
  apexFloor: 0.4,
  /** Descending into a face more than this far below the cell top is a
   *  ridge strike (ball drops back), not a landing. */
  faceStrikeLevels: 0.6,
  /** Flight before this fraction of the carry can't strike (it's leaving
   *  its own hex). */
  minStrikeS: 0.12,
  /** Tree hexes: canopy spans from `trunkLevels` to `canopyLevels` above
   *  the cell; below the trunk line a punch sneaks under. */
  trunkLevels: 0.8,
  canopyLevels: 2.2,
  /** Hard cap on roll-out hexes. */
  maxRoll: 6,
  /** Fog cleared either side of the flight + roll path (hex radius). */
  clearRadius: 1,
  /** Ground shots (putter, bumpRun): max levels climbable per hex entered;
   *  each level climbed eats this many hexes of run. */
  groundMaxClimb: 1,
  groundClimbCost: 1,
  /** Wind drift in hexes per unit wind per level of apex (per day wind
   *  magnitude is rolled in [0, maxWind]). */
  maxWind: 0.25,
} as const;

/** Aim mode UI. */
export const AIM = {
  /** Screen px within which a pointer-down grabs the target marker instead
   *  of panning. */
  markerGrabPx: 30,
} as const;

/** Flight animation (cosmetic only — the outcome is already decided). */
export const FLIGHT_ANIM = {
  /** Ball speed through the air, hexes per second. */
  hexesPerSec: 13,
  /** Roll-out speed, hexes per second. */
  rollHexesPerSec: 5,
  /** Pause after the ball stops before the scene returns to traverse. */
  settleMs: 350,
  /** Ball radius on the map (world px) and the scale added per level of height. */
  ballRadius: 4.5,
  heightScale: 0.12,
} as const;

/** The 3-tap swing meter (`shot/meter.ts`). Power phase: the needle sweeps
 *  0→1→0 and the tap sets power. Accuracy phase: the needle runs back down
 *  from the power mark toward the zero line at the same speed; tap on the
 *  line for a pure strike, early = push (positive error), late = pull. */
export const METER = {
  /** ms for one 0→1 sweep on a fairway lie (lie `sweep` divides this). */
  sweepMs: 1100,
  /** Half-width of the pure band in needle units on a fairway lie with a
   *  neutral club — scaled by club.sweetSpotWidth and LIE.sweet. */
  sweetHalfWidth: 0.07,
  /** Needle units the zero line shifts per level of side-slope. */
  slopeShiftPerLevel: 0.08,
  /** Below zero-line − this, the swing auto-resolves as a full pull. */
  overshoot: 0.3,
  /** Power floor so a frantic double-tap still moves the ball. */
  minPower: 0.08,
  /** How long the finished meter lingers over the flight (ms). */
  lingerMs: 900,
} as const;
