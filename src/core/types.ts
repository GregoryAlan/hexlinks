import type { SurfaceKind } from './config';

export interface Vec2 {
  x: number;
  y: number;
}

/** A static terrain body in a side-view stage, logical stage coordinates. */
export interface TerrainSpec {
  /** Stable id within a stage — used as rough.js drawable cache key. */
  id: string;
  kind: SurfaceKind;
  /** Convex or concave polygon, absolute logical coords, CW or CCW. */
  verts: Vec2[];
}

/** A hittable circle body (enemies in battles, props in mini-games). */
export interface TargetSpec {
  id: string;
  pos: Vec2;
  radius: number;
}

/** A trigger region: fires when the ball comes to near-rest inside it
 *  (ink-links cup-sink semantics; the cup notch is `topY`-gated so a ball
 *  rolling over the lip doesn't count). */
export interface SensorSpec {
  id: string;
  verts: Vec2[];
  /** Ball center must be at or below this y (if given) to trigger. */
  topY?: number;
}

/** Pure data describing one side-view physics scenario. No Matter.js
 *  objects — unit-testable; built by stage/stageSpecs.ts builders (P3+). */
export interface StageSpec {
  /** Logical viewport; physics walls/out-of-bounds derive from it. */
  bounds: { width: number; height: number };
  /** Ball spawn (center). */
  ball: Vec2;
  terrain: TerrainSpec[];
  targets?: TargetSpec[];
  sensors?: SensorSpec[];
  /** Vertical gravity scale, 1 = matter default. */
  gravity?: number;
}
