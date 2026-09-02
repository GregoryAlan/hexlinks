import type { Vec2 } from '../core/types';

/** Stack-based scene flow (PLAN.md §Scene system): overworld pushes battle,
 *  battle pushes reward, dialogue overlays anything. The manager is DOM-free —
 *  scenes reach the DOM only through SceneContext.overlay — so scene-flow
 *  tests run headless with a stub context.
 *
 *  Payloads typed `unknown` tighten as each system lands (P1–P6). */
export type SceneRequest =
  | { kind: 'homeBase' }
  | { kind: 'overworld'; hole: unknown; run: unknown }
  | { kind: 'battle'; encounter: unknown; party: unknown }
  | { kind: 'minigame'; game: string; spec: unknown }
  | { kind: 'dialogue'; script: unknown }
  | { kind: 'reward'; rewards: unknown }
  | { kind: 'runSummary'; result: unknown };

export type SceneResult =
  | { kind: 'battle'; outcome: unknown }
  | { kind: 'minigame'; outcome: unknown }
  | { kind: 'dialogue' }
  | { kind: 'reward' }
  | { kind: 'runSummary'; result: unknown };

export type PointerEvt =
  | {
      type: 'down' | 'move' | 'up' | 'cancel';
      /** Logical coordinates (camera/scene space is the scene's business). */
      pos: Vec2;
      /** Pointer id for multi-touch gestures (absent in headless tests). */
      id?: number;
    }
  | { type: 'wheel'; pos: Vec2; delta: number };

/** The one DOM seam scenes may touch (implemented by ui/overlay.ts; stubbed
 *  in headless tests). */
export interface OverlayHost {
  show(html: string, wire?: (root: HTMLElement) => void): void;
  clear(): void;
  /** Non-modal corner HUD text (scorecard, hints). Empty string hides it. */
  hud(html: string): void;
}

export interface SceneContext {
  /** Request a push/pop; applied at the next tick boundary, never mid-step. */
  push(req: SceneRequest): void;
  pop(result?: SceneResult): void;
  overlay: OverlayHost;
}

export interface SceneView {
  width: number;
  height: number;
}

export interface Scene {
  /** Create bakes/physics here, free them in exit(). */
  enter(ctx: SceneContext): void;
  /** Called when the scene above popped; carries its result if it had one. */
  resume(result?: SceneResult): void;
  step(dtMs: number): void;
  render(g: CanvasRenderingContext2D, view: SceneView, alpha: number): void;
  handlePointer(e: PointerEvt): void;
  /** Opaque scenes hide everything beneath them; dialogue/reward overlays
   *  render the scene under them. */
  readonly opaque: boolean;
  exit(): void;
}

export type SceneFactory = (req: SceneRequest) => Scene;

export class SceneManager {
  private stack: Scene[] = [];
  private pending: Array<
    { op: 'push'; req: SceneRequest } | { op: 'pop'; result?: SceneResult }
  > = [];
  private readonly ctx: SceneContext;

  constructor(private factory: SceneFactory, overlay: OverlayHost) {
    this.ctx = {
      push: (req) => this.pending.push({ op: 'push', req }),
      pop: (result) => this.pending.push({ op: 'pop', result }),
      overlay,
    };
  }

  get depth(): number {
    return this.stack.length;
  }

  get top(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }

  /** Seed the stack (boot). Deferred like every other request. */
  push(req: SceneRequest): void {
    this.ctx.push(req);
  }

  /** Advance one tick: apply queued push/pops at the boundary, then step the
   *  TOP scene only. */
  step(dtMs: number): void {
    this.applyPending();
    this.top?.step(dtMs);
  }

  private applyPending(): void {
    // Requests made while applying (e.g. enter() immediately pushes a
    // dialogue) land in the same boundary — drain until stable.
    while (this.pending.length > 0) {
      const batch = this.pending;
      this.pending = [];
      for (const p of batch) {
        if (p.op === 'push') {
          const scene = this.factory(p.req);
          this.stack.push(scene);
          scene.enter(this.ctx);
        } else {
          const popped = this.stack.pop();
          popped?.exit();
          // Results return synchronously on pop; the exposed scene always
          // resumes (result is undefined for a plain back-out).
          if (popped && this.top) this.top.resume(p.result);
        }
      }
    }
  }

  /** Render the stack bottom-up, skipping scenes hidden under an opaque one. */
  render(g: CanvasRenderingContext2D, view: SceneView, alpha: number): void {
    let start = 0;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].opaque) {
        start = i;
        break;
      }
    }
    for (let i = start; i < this.stack.length; i++) {
      this.stack[i].render(g, view, alpha);
    }
  }

  /** Pointer events route to the top scene only. */
  handlePointer(e: PointerEvt): void {
    this.top?.handlePointer(e);
  }

  destroy(): void {
    while (this.stack.length > 0) this.stack.pop()!.exit();
    this.pending = [];
  }
}
