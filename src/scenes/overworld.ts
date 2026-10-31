import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import { COLORS, ISO_COLORS, MOVE, TERRAIN_MOVE_COST } from '../core/config';
import { DEBUG } from '../core/debug';
import type { Vec2 } from '../core/types';
import { axialToIso, hexEq, hexKey, isoPick, type Axial } from '../hex/coords';
import { cellAt, type HoleMap } from '../hex/map';
import { findPath } from '../hex/path';
import { GestureRecognizer } from '../input/gestures';
import { Camera } from '../render/camera';
import { HexRenderer, spriteBBox, type FaceStyle, type LayerBake } from '../render/hexRenderer';
import { seedFrom } from '../render/roughCache';
import { beginRun, clearHexes, isCleared, stepParty, type RunState } from '../state/run';
import type { PointerEvt, Scene, SceneContext, SceneResult, SceneView } from './sceneManager';

/** P1 overworld: walk the iso hex course. Traverse mode only — tap a hex to
 *  A* there (fog and climbs cost extra, cliffs block), drag pans, pinch or
 *  wheel zooms. Aim mode, shots and fog clearing arrive in P2. */

export interface OverworldRequest {
  map: HoleMap;
  run?: RunState;
  faceStyle?: FaceStyle;
  /** Starting zoom (prototype screenshots). */
  zoom?: number;
  /** Start with the whole hole cleared (art review only). */
  fogOff?: boolean;
}

interface Walk {
  path: Axial[];
  /** Index of the hex being entered. */
  idx: number;
  /** 0..1 progress into path[idx] from path[idx-1]. */
  t: number;
  msPerHex: number;
}

export class OverworldScene implements Scene {
  readonly opaque = true;
  private ctx!: SceneContext;
  private map: HoleMap;
  private run: RunState;
  private renderer: HexRenderer;
  private camera: Camera;
  private terrain: LayerBake | null = null;
  private fog: LayerBake | null = null;
  private fogVersion = -1;
  private clearedVersion = 0;
  private rc: RoughCanvas | null = null;
  private rcCanvas: HTMLCanvasElement | null = null;
  private walk: Walk | null = null;
  private preview: Axial[] = [];
  private previewCost = 0;
  private gestures: GestureRecognizer;
  private lastView: SceneView = { width: 390, height: 780 };
  private clock = 0;
  private hover: Axial | null = null;

  constructor(req: OverworldRequest) {
    this.map = req.map;
    this.run = req.run ?? beginRun(req.map.seed, req.map);
    if (req.fogOff) this.run = clearHexes(this.run, [...req.map.cells.values()].map((c) => c.coord));
    this.renderer = new HexRenderer(req.map, { faceStyle: req.faceStyle ?? 'flat' });
    this.camera = new Camera(axialToIso(this.run.partyHex, cellAt(this.map, this.run.partyHex)!.elevation), req.zoom ?? 0.9);
    this.gestures = new GestureRecognizer({
      onTap: (pos) => this.tap(pos),
      onPan: (d) => this.camera.panBy(d.x, d.y),
      onPinch: (c, f) => this.camera.zoomAt(f, c, this.lastView),
      onWheel: (pos, f) => this.camera.zoomAt(f, pos, this.lastView),
    });
  }

  enter(ctx: SceneContext): void {
    this.ctx = ctx;
    this.terrain = this.renderer.bakeTerrain();
    this.updateHud();
  }

  resume(_result?: SceneResult): void {}

  exit(): void {
    this.terrain = null;
    this.fog = null;
    this.ctx.overlay.hud('');
  }

  private updateHud(): void {
    const t = cellAt(this.map, this.run.partyHex)!;
    this.ctx.overlay.hud(
      `<span>${this.map.name} &middot; par ${this.map.par}</span><span>${t.terrain} &middot; lvl ${t.elevation}</span>`,
    );
  }

  // ---- input -----------------------------------------------------------------

  handlePointer(e: PointerEvt): void {
    this.gestures.handle(e, this.clock);
    if (e.type === 'move' && this.gestures.pointerCount === 0) {
      this.hover = this.pick(e.pos);
    }
  }

  private pick(screen: Vec2): Axial | null {
    const w = this.camera.screenToWorld(screen, this.lastView);
    const h = isoPick(w, (a) => cellAt(this.map, a)?.elevation);
    return h ?? null;
  }

  private tap(screen: Vec2): void {
    const h = this.pick(screen);
    if (!h) return;
    if (this.walk) {
      // Re-route from the hex currently being entered.
      const from = this.walk.path[this.walk.idx];
      const r = findPath(this.map, from, h, { cleared: this.run.clearedHexes });
      if (r.path.length > 1) this.walk = { path: r.path, idx: 1, t: 0, msPerHex: MOVE.walkMsPerHex };
      return;
    }
    if (hexEq(h, this.run.partyHex)) return;
    const r = findPath(this.map, this.run.partyHex, h, { cleared: this.run.clearedHexes });
    if (r.path.length < 2) {
      this.preview = [];
      return;
    }
    this.preview = r.path;
    this.previewCost = r.cost;
    this.walk = { path: r.path, idx: 1, t: 0, msPerHex: MOVE.walkMsPerHex };
  }

  // ---- sim -------------------------------------------------------------------

  step(dtMs: number): void {
    this.clock += dtMs;
    if (this.walk) {
      const w = this.walk;
      const into = cellAt(this.map, w.path[w.idx])!;
      const slow = Math.min(3, TERRAIN_MOVE_COST[into.terrain]) * 0.5 + 0.5; // rough is slower going
      w.t += dtMs / (w.msPerHex * slow);
      while (w.t >= 1) {
        w.t -= 1;
        this.run = stepParty(this.run, w.path[w.idx]);
        w.idx++;
        if (w.idx >= w.path.length) {
          this.walk = null;
          this.preview = [];
          this.updateHud();
          break;
        }
      }
      this.camera.follow(this.partyIso());
    }
    this.camera.update(dtMs);
    this.camera.clampTo(this.map.worldBounds, this.lastView);
  }

  /** Iso-world position of the party, interpolated mid-step. */
  private partyIso(): Vec2 {
    const a = this.run.partyHex;
    const pa = axialToIso(a, cellAt(this.map, a)!.elevation);
    if (!this.walk) return pa;
    const b = this.walk.path[this.walk.idx];
    const pb = axialToIso(b, cellAt(this.map, b)!.elevation);
    const t = easeInOut(this.walk.t);
    return { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t };
  }

  // ---- render ----------------------------------------------------------------

  render(g: CanvasRenderingContext2D, view: SceneView, _alpha: number): void {
    this.lastView = view;
    if (!this.rc || this.rcCanvas !== g.canvas) {
      this.rc = rough.canvas(g.canvas);
      this.rcCanvas = g.canvas;
    }
    if (!this.terrain) return;
    if (!this.fog || this.fogVersion !== this.clearedVersion) {
      this.fog = this.renderer.bakeFog(this.run.clearedHexes);
      this.fogVersion = this.clearedVersion;
    }

    g.fillStyle = ISO_COLORS.groundPaper;
    g.fillRect(0, 0, view.width, view.height);

    g.save();
    g.translate(view.width / 2, view.height / 2);
    g.scale(this.camera.zoom, this.camera.zoom);
    g.translate(-this.camera.center.x, -this.camera.center.y);

    this.renderer.blit(g, this.terrain);
    this.drawPathPreview(g);
    this.renderer.blit(g, this.fog);
    this.drawParty(g);
    this.drawHover(g);

    g.restore();
  }

  private drawPathPreview(g: CanvasRenderingContext2D): void {
    if (this.preview.length < 2) return;
    g.save();
    g.strokeStyle = COLORS.ink;
    g.fillStyle = COLORS.ink;
    g.globalAlpha = 0.55;
    g.setLineDash([3, 5]);
    g.lineWidth = 1.2;
    g.beginPath();
    this.preview.forEach((h, i) => {
      const p = axialToIso(h, cellAt(this.map, h)!.elevation);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    });
    g.stroke();
    g.setLineDash([]);
    const end = this.preview[this.preview.length - 1];
    const pe = axialToIso(end, cellAt(this.map, end)!.elevation);
    g.beginPath();
    g.arc(pe.x, pe.y, 3, 0, Math.PI * 2);
    g.fill();
    if (DEBUG.pathCost) {
      g.globalAlpha = 1;
      g.fillStyle = COLORS.accent;
      g.font = '10px Georgia';
      g.fillText(`cost ${this.previewCost}`, pe.x + 6, pe.y - 6);
    }
    g.restore();
  }

  private drawParty(g: CanvasRenderingContext2D): void {
    const p = this.partyIso();
    // Stand-in figure until the character sprites land (P4): a top-hatted
    // ink silhouette with a bone face — the Caddy is a step behind.
    this.drawFigure(g, p.x, p.y, 1, seedFrom('player'));
    const behind = this.trailPoint();
    this.drawFigure(g, behind.x, behind.y, 0.85, seedFrom('caddy'));
    // Ball marker (P1: it sits at the ball hex).
    const b = axialToIso(this.run.ballHex, cellAt(this.map, this.run.ballHex)!.elevation);
    if (!hexEq(this.run.ballHex, this.run.partyHex) || this.walk) {
      g.fillStyle = ISO_COLORS.ball;
      g.strokeStyle = COLORS.ink;
      g.lineWidth = 1.1;
      g.beginPath();
      g.arc(b.x + 10, b.y + 4, 4, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // Depth: terrain in front of the party re-covers it.
    const row = this.walk ? Math.max(this.walk.path[this.walk.idx].r, this.run.partyHex.r) : this.run.partyHex.r;
    this.renderer.drawOccluders(g, this.rc!, spriteBBox(p), row, this.run.clearedHexes);
  }

  private trailPoint(): Vec2 {
    const p = this.partyIso();
    if (!this.walk) return { x: p.x - 14, y: p.y + 4 };
    const a = this.walk.path[this.walk.idx - 1];
    const pa = axialToIso(a, cellAt(this.map, a)!.elevation);
    const t = easeInOut(Math.max(0, this.walk.t - 0.35));
    const b = this.walk.path[this.walk.idx];
    const pb = axialToIso(b, cellAt(this.map, b)!.elevation);
    return { x: pa.x + (pb.x - pa.x) * t - 6, y: pa.y + (pb.y - pa.y) * t + 3 };
  }

  private drawFigure(g: CanvasRenderingContext2D, x: number, y: number, s: number, _seed: number): void {
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    // shadow
    g.fillStyle = 'rgba(43,40,34,0.18)';
    g.beginPath();
    g.ellipse(0, 2, 9, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 1.2;
    g.strokeStyle = COLORS.ink;
    // body (coat)
    g.fillStyle = COLORS.ink;
    g.beginPath();
    g.moveTo(-5, -4);
    g.lineTo(5, -4);
    g.lineTo(6, -20);
    g.lineTo(-6, -20);
    g.closePath();
    g.fill();
    // head
    g.fillStyle = ISO_COLORS.ball;
    g.beginPath();
    g.arc(0, -25, 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    // hat
    g.fillStyle = COLORS.ink;
    g.fillRect(-6, -31, 12, 1.6);
    g.fillRect(-4, -38, 8, 7);
    g.restore();
  }

  private drawHover(g: CanvasRenderingContext2D): void {
    if (!this.hover) return;
    const cell = cellAt(this.map, this.hover);
    if (!cell) return;
    const f = this.renderer.faces(cell);
    g.save();
    g.strokeStyle = COLORS.accent;
    g.lineWidth = 1.4;
    g.globalAlpha = isCleared(this.run, this.hover) ? 0.9 : 0.5;
    g.beginPath();
    f.top.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.closePath();
    g.stroke();
    g.restore();
  }

  /** P2 hook: shots call this after the corridor is carved. */
  markFogDirty(): void {
    this.clearedVersion++;
  }

  // Exposed for the prototype/E2E harness.
  get debugState() {
    return {
      party: this.run.partyHex,
      key: hexKey(this.run.partyHex),
      partyScreen: this.camera.worldToScreen(this.partyIso(), this.lastView),
      cleared: this.run.clearedHexes.size,
      zoom: this.camera.zoom,
      center: { ...this.camera.center },
      walking: this.walk !== null,
    };
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
