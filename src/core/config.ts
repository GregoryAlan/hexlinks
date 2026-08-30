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
