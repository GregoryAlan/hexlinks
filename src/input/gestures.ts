import { GESTURE } from '../core/config';
import type { Vec2 } from '../core/types';
import type { PointerEvt } from '../scenes/sceneManager';

/** Tap / pan / pinch recognizer over the scene-level PointerEvt stream.
 *  DOM-free (scenes feed it; tests drive it) — the only input rule it needs
 *  is that events carry a pointer id. A one-finger drag past the slop pans;
 *  a second finger turns the gesture into a pinch (scale about the centroid,
 *  centroid motion pans); a short still press is a tap. Wheel maps to zoom. */

export interface GestureCallbacks {
  onTap?(pos: Vec2): void;
  onPan?(delta: Vec2): void;
  onPinch?(center: Vec2, factor: number): void;
  onWheel?(pos: Vec2, factor: number): void;
  onPanEnd?(): void;
}

interface Tracked {
  start: Vec2;
  cur: Vec2;
  t0: number;
}

export class GestureRecognizer {
  private pointers = new Map<number, Tracked>();
  private panning = false;
  private lastCentroid: Vec2 | null = null;
  private lastDist = 0;

  constructor(private cb: GestureCallbacks) {}

  get pointerCount(): number {
    return this.pointers.size;
  }

  reset(): void {
    this.pointers.clear();
    this.panning = false;
    this.lastCentroid = null;
  }

  handle(e: PointerEvt, nowMs: number): void {
    if (e.type === 'wheel') {
      // Trackpad/wheel: ~100 units per notch → 10% zoom per notch.
      const factor = Math.exp(-e.delta * 0.001);
      this.cb.onWheel?.(e.pos, factor);
      return;
    }
    const id = e.id ?? 0;
    switch (e.type) {
      case 'down': {
        this.pointers.set(id, { start: { ...e.pos }, cur: { ...e.pos }, t0: nowMs });
        this.syncMulti();
        break;
      }
      case 'move': {
        const p = this.pointers.get(id);
        if (!p) return;
        p.cur = { ...e.pos };
        if (this.pointers.size >= 2) {
          this.pinchStep();
        } else {
          if (!this.panning && dist(p.start, p.cur) > GESTURE.tapSlopPx) {
            this.panning = true;
            this.lastCentroid = { ...p.start };
          }
          if (this.panning && this.lastCentroid) {
            this.cb.onPan?.({ x: p.cur.x - this.lastCentroid.x, y: p.cur.y - this.lastCentroid.y });
            this.lastCentroid = { ...p.cur };
          }
        }
        break;
      }
      case 'up': {
        const p = this.pointers.get(id);
        if (!p) return;
        this.pointers.delete(id);
        const wasMulti = this.lastDist > 0;
        if (!this.panning && !wasMulti && nowMs - p.t0 <= GESTURE.tapMaxMs && dist(p.start, e.pos) <= GESTURE.tapSlopPx) {
          this.cb.onTap?.(e.pos);
        }
        if (this.pointers.size === 0) {
          if (this.panning || wasMulti) this.cb.onPanEnd?.();
          this.panning = false;
          this.lastCentroid = null;
          this.lastDist = 0;
        } else {
          this.syncMulti();
        }
        break;
      }
      case 'cancel': {
        this.pointers.delete(id);
        if (this.pointers.size === 0) this.reset();
        else this.syncMulti();
        break;
      }
    }
  }

  /** (Re)anchor pinch state when the finger set changes. */
  private syncMulti(): void {
    const pts = [...this.pointers.values()];
    if (pts.length >= 2) {
      this.panning = true; // any multi-touch is never a tap
      this.lastCentroid = centroid(pts);
      this.lastDist = dist(pts[0].cur, pts[1].cur);
    } else if (pts.length === 1 && this.panning) {
      this.lastCentroid = { ...pts[0].cur };
      this.lastDist = 0;
    }
  }

  private pinchStep(): void {
    const pts = [...this.pointers.values()];
    const c = centroid(pts);
    const d = dist(pts[0].cur, pts[1].cur);
    if (this.lastCentroid) this.cb.onPan?.({ x: c.x - this.lastCentroid.x, y: c.y - this.lastCentroid.y });
    if (this.lastDist > 0 && d > 0) this.cb.onPinch?.(c, d / this.lastDist);
    this.lastCentroid = c;
    this.lastDist = d;
  }
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function centroid(pts: Tracked[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.cur.x;
    y += p.cur.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}
