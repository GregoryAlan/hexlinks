import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import { AIM, BALLISTICS, COLORS, FLIGHT_ANIM, HEX, ISO_COLORS, METER, MOVE, TERRAIN_MOVE_COST } from '../core/config';
import { DEBUG } from '../core/debug';
import { makeRng } from '../core/rng';
import type { Vec2 } from '../core/types';
import { clubAllowed, clubDef, shapeAllowed, startBag } from '../data/clubs';
import { axialToIso, hexEq, hexKey, isoPick, type Axial } from '../hex/coords';
import { cellAt, type HoleMap } from '../hex/map';
import { findPath } from '../hex/path';
import { GestureRecognizer } from '../input/gestures';
import { Camera } from '../render/camera';
import { HexRenderer, spriteBBox, type FaceStyle, type LayerBake } from '../render/hexRenderer';
import { seedFrom } from '../render/roughCache';
import { drawMeter } from '../render/meterHud';
import { dispersionHexes, distHexes, flatDir, HEX_W, lieOf, powerFor, predictShot, resolveShot, sideSlope } from '../shot/ballistics';
import { meterConfigFor, meterStart, meterTap, meterTick, type MeterConfig, type MeterState } from '../shot/meter';
import { NO_SPIN, NO_WIND, toRecord, type ClubId, type ShotInput, type ShotOutcome, type ShotShape, type Spin } from '../shot/types';
import { applyShot, beginRun, clearHexes, isCleared, shotSeed, stepParty, type RunState } from '../state/run';
import type { PointerEvt, Scene, SceneContext, SceneResult, SceneView } from './sceneManager';

/** The overworld (PLAN v2 §Overworld modes). One scene, several modes:
 *  - traverse: tap a hex to A* there; tap the ball while standing on it to aim.
 *  - aim: tap a target hex (or drag the marker); pick club/shape/spin in the
 *    panel; the preview shows the corridor, the dispersion ring and where
 *    the ball should finish. Panning is still free — aim is tap-to-target.
 *  - flight: the resolved shot animates along its samples; a tap skips.
 *  - holed: hole-out card.
 *  - swing: the 3-tap meter (raw pointer-downs, not gestures — tap latency
 *    matters); power then accuracy, lie and side-slope shape the band.
 *  The pure model is in shot/; this scene only sequences and draws. */

export interface OverworldRequest {
  map: HoleMap;
  run?: RunState;
  seed?: string;
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

type Mode =
  | { kind: 'traverse' }
  | { kind: 'aim'; club: ClubId; shape: ShotShape; spin: Spin; target: Axial | null; dragging: boolean }
  | { kind: 'swing'; input: Omit<ShotInput, 'swing'>; meter: MeterState; cfg: MeterConfig; targetPower: number }
  | { kind: 'flight'; outcome: ShotOutcome; t: number; done: boolean; anim: FlightAnim }
  | { kind: 'holed' };

/** Pre-baked animation track: iso points with timestamps. */
interface FlightAnim {
  pts: Array<{ p: Vec2; shadow: Vec2; hex: Axial; h: number; at: number }>;
  totalMs: number;
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
  private fogFor: ReadonlySet<string> | null = null;
  private rc: RoughCanvas | null = null;
  private rcCanvas: HTMLCanvasElement | null = null;
  private walk: Walk | null = null;
  private preview: Axial[] = [];
  private previewCost = 0;
  private gestures: GestureRecognizer;
  private lastView: SceneView = { width: 390, height: 780 };
  private clock = 0;
  private hover: Axial | null = null;
  private mode: Mode = { kind: 'traverse' };
  private bag: ClubId[] = startBag();
  private aimPreview: ShotOutcome | null = null;
  private aimPreviewKey = '';
  /** The finished meter lingers over the start of the flight. */
  private lastMeter: { cfg: MeterConfig; state: MeterState; targetPower: number; club: string; until: number } | null = null;

  constructor(req: OverworldRequest) {
    this.map = req.map;
    this.run = req.run ?? beginRun(req.seed ?? req.map.seed, req.map);
    if (req.fogOff) this.run = clearHexes(this.run, [...req.map.cells.values()].map((c) => c.coord));
    this.renderer = new HexRenderer(req.map, { faceStyle: req.faceStyle ?? 'flat' });
    this.camera = new Camera(axialToIso(this.run.partyHex, cellAt(this.map, this.run.partyHex)!.elevation), req.zoom ?? 0.9);
    this.gestures = new GestureRecognizer({
      shouldCapture: (pos) => this.nearTargetMarker(pos),
      onDragStart: (pos) => this.dragTarget(pos),
      onDrag: (pos) => this.dragTarget(pos),
      onDragEnd: (pos) => this.dragTarget(pos, true),
      onTap: (pos) => this.tap(pos),
      onPan: (d) => this.camera.panBy(d.x, d.y),
      onPinch: (c, f) => this.camera.zoomAt(f, c, this.lastView),
      onWheel: (pos, f) => this.camera.zoomAt(f, pos, this.lastView),
    });
  }

  enter(ctx: SceneContext): void {
    this.ctx = ctx;
    this.terrain = this.renderer.bakeTerrain();
    this.refreshUi();
  }

  resume(_result?: SceneResult): void {}

  exit(): void {
    this.terrain = null;
    this.fog = null;
    this.ctx.overlay.hud('');
    this.ctx.overlay.panel('');
  }

  // ---- UI (DOM via the overlay host only) --------------------------------------

  private refreshUi(): void {
    this.updateHud();
    this.renderPanel();
  }

  private updateHud(): void {
    const t = cellAt(this.map, this.run.partyHex)!;
    this.ctx.overlay.hud(
      `<span>${this.map.name} &middot; par ${this.map.par}</span><span>stroke ${this.run.strokes} &middot; ${t.terrain} ${t.elevation}</span>`,
    );
  }

  private onBall(): boolean {
    return hexEq(this.run.partyHex, this.run.ballHex);
  }

  private renderPanel(): void {
    const m = this.mode;
    if (m.kind === 'traverse') {
      if (this.run.holed) return this.ctx.overlay.panel('');
      const html = this.onBall()
        ? `<div class="row"><button class="primary" data-action="aim">Address the ball</button></div>`
        : `<div class="row"><button data-action="walk-ball">Walk to the ball</button><span class="hint">or tap a hex to walk</span></div>`;
      return this.ctx.overlay.panel(html, (root) => {
        root.querySelector('[data-action="aim"]')?.addEventListener('click', () => this.enterAim());
        root.querySelector('[data-action="walk-ball"]')?.addEventListener('click', () => this.walkTo(this.run.ballHex));
      });
    }
    if (m.kind === 'aim') {
      const lie = lieOf(this.map, this.run.ballHex);
      const clubs = this.bag
        .map((id) => {
          const ok = clubAllowed(id, lie);
          return `<button data-club="${id}" class="${id === m.club ? 'active' : ''}" ${ok ? '' : 'disabled'}>${clubDef(id).name}</button>`;
        })
        .join('');
      const shapes = (['standard', 'punch', 'flop', 'bumpRun'] as ShotShape[])
        .filter((s) => shapeAllowed(m.club, s))
        .map((s) => `<button data-shape="${s}" class="${s === m.shape ? 'active' : ''}">${SHAPE_LABEL[s]}</button>`)
        .join('');
      const spinBtn = (k: 'roll' | 'curve', v: -1 | 0 | 1, label: string) =>
        `<button data-spin="${k}:${v}" class="${m.spin[k] === v ? 'active' : ''}">${label}</button>`;
      const spin = [spinBtn('roll', -1, 'Back'), spinBtn('roll', 0, 'Flat'), spinBtn('roll', 1, 'Top'), spinBtn('curve', -1, 'Draw'), spinBtn('curve', 0, 'Straight'), spinBtn('curve', 1, 'Fade')].join('');
      const hint = m.target ? this.previewHint() : 'Tap where to send it.';
      const html = `<div class="row">${clubs}</div><div class="row">${shapes}</div><div class="row">${spin}</div>
        <div class="hint">${hint}</div>
        <div class="row"><button class="primary" data-action="swing" ${m.target ? '' : 'disabled'}>Swing</button><button data-action="cancel">Cancel</button></div>`;
      return this.ctx.overlay.panel(html, (root) => {
        root.querySelectorAll<HTMLButtonElement>('[data-club]').forEach((b) =>
          b.addEventListener('click', () => this.setAim({ club: b.dataset.club as ClubId })),
        );
        root.querySelectorAll<HTMLButtonElement>('[data-shape]').forEach((b) =>
          b.addEventListener('click', () => this.setAim({ shape: b.dataset.shape as ShotShape })),
        );
        root.querySelectorAll<HTMLButtonElement>('[data-spin]').forEach((b) =>
          b.addEventListener('click', () => {
            const [k, v] = b.dataset.spin!.split(':');
            this.setAim({ spin: { ...m.spin, [k]: Number(v) } as Spin });
          }),
        );
        root.querySelector('[data-action="swing"]')?.addEventListener('click', () => this.startSwing());
        root.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.leaveAim());
      });
    }
    if (m.kind === 'swing') {
      return this.ctx.overlay.panel(
        `<div class="row"><span class="hint">Tap anywhere: once for power, once on the line.</span><button data-action="cancel">Cancel</button></div>`,
        (root) => root.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.cancelSwing()),
      );
    }
    if (m.kind === 'flight') return this.ctx.overlay.panel(`<div class="hint">Tap to skip</div>`);
    this.ctx.overlay.panel('');
  }

  private previewHint(): string {
    const o = this.aimPreview;
    const m = this.mode;
    if (!o || m.kind !== 'aim' || !m.target) return '';
    const dist = distHexes(this.run.ballHex, m.target).toFixed(1);
    const restCell = cellAt(this.map, o.restHex);
    // Fog hides detail (issue #9): only name the lie on cleared ground.
    const where = restCell && isCleared(this.run, o.restHex) ? restCell.terrain : 'the fog';
    const warn = o.events.includes('ridgeStrike') ? ' — blocked by the ridge' : o.terminal === 'water' ? ' — in the water' : o.terminal === 'oob' ? ' — off the estate' : '';
    const power = Math.round(powerFor(distHexes(this.run.ballHex, m.target), clubDef(m.club), m.shape, lieOf(this.map, this.run.ballHex)) * 100);
    return `${dist} hexes · ${power}% ${clubDef(m.club).name} · finishes on ${where}${warn} · clears ${o.clearedPath.length} hexes`;
  }

  // ---- mode transitions ----------------------------------------------------------

  private enterAim(): void {
    if (!this.onBall() || this.run.holed || this.walk) return;
    const lie = lieOf(this.map, this.run.ballHex);
    const club = this.bag.find((id) => clubAllowed(id, lie)) ?? 'wedge';
    this.mode = { kind: 'aim', club, shape: 'standard', spin: NO_SPIN, target: null, dragging: false };
    this.aimPreview = null;
    this.preview = [];
    this.gestures.reset();
    this.refreshUi();
  }

  private leaveAim(): void {
    this.mode = { kind: 'traverse' };
    this.aimPreview = null;
    this.refreshUi();
  }

  private setAim(patch: Partial<{ club: ClubId; shape: ShotShape; spin: Spin; target: Axial | null }>): void {
    if (this.mode.kind !== 'aim') return;
    const m = { ...this.mode, ...patch };
    if (!shapeAllowed(m.club, m.shape)) m.shape = 'standard';
    this.mode = m;
    this.refreshPreview();
    this.renderPanel();
  }

  private aimInput(): ShotInput | null {
    const m = this.mode;
    if (m.kind !== 'aim' || !m.target) return null;
    const lie = lieOf(this.map, this.run.ballHex);
    const power = powerFor(distHexes(this.run.ballHex, m.target), clubDef(m.club), m.shape, lie);
    return { from: this.run.ballHex, target: m.target, club: m.club, shape: m.shape, spin: m.spin, swing: { power, accuracy: 0 }, wind: NO_WIND };
  }

  private refreshPreview(): void {
    const input = this.aimInput();
    if (!input) {
      this.aimPreview = null;
      return;
    }
    const key = `${hexKey(input.target)}|${input.club}|${input.shape}|${input.spin.roll}|${input.spin.curve}`;
    if (key === this.aimPreviewKey && this.aimPreview) return;
    this.aimPreviewKey = key;
    this.aimPreview = predictShot(input, this.map);
  }

  private startSwing(): void {
    const full = this.aimInput();
    if (!full || this.mode.kind !== 'aim') return;
    const { swing, ...input } = full;
    const lie = lieOf(this.map, input.from);
    const slope = sideSlope(this.map, input.from, flatDir(input.from, input.target));
    const cfg = meterConfigFor(clubDef(input.club), lie, slope, input.spin);
    this.mode = { kind: 'swing', input, meter: meterStart(this.clock), cfg, targetPower: swing.power };
    this.gestures.reset();
    this.refreshUi();
  }

  private cancelSwing(): void {
    if (this.mode.kind !== 'swing') return;
    const i = this.mode.input;
    this.mode = { kind: 'aim', club: i.club, shape: i.shape, spin: i.spin, target: i.target, dragging: false };
    this.refreshPreview();
    this.refreshUi();
  }

  private commitSwing(): void {
    const m = this.mode;
    if (m.kind !== 'swing' || m.meter.phase !== 'done') return;
    const input: ShotInput = { ...m.input, swing: m.meter.result };
    const outcome = resolveShot(input, this.map, makeRng(shotSeed(this.run)));
    this.lastMeter = { cfg: m.cfg, state: m.meter, targetPower: m.targetPower, club: clubDef(m.input.club).name, until: this.clock + METER.lingerMs };
    this.mode = { kind: 'flight', outcome, t: 0, done: false, anim: this.buildAnim(outcome) };
    this.aimPreview = null;
    this.gestures.reset();
    this.refreshUi();
  }

  private finishFlight(): void {
    if (this.mode.kind !== 'flight') return;
    const o = this.mode.outcome;
    this.run = applyShot(this.run, this.map, toRecord(o));
    if (this.run.holed) {
      this.mode = { kind: 'holed' };
      this.showHoledCard();
    } else {
      this.mode = { kind: 'traverse' };
    }
    this.refreshUi();
  }

  private showHoledCard(): void {
    const n = this.run.strokes;
    const vs = n - this.map.par;
    const word = vs <= -2 ? 'Eagle' : vs === -1 ? 'Birdie' : vs === 0 ? 'Par' : vs === 1 ? 'Bogey' : `+${vs}`;
    this.ctx.overlay.show(
      `<h1>Holed out</h1><p class="scorecard">${n} stroke${n === 1 ? '' : 's'} &middot; par ${this.map.par}<br>${word}</p>
       <p class="muted">${this.run.claimedHexes.size} hexes claimed from the fog.</p>
       <button data-action="done">Back to the shed</button>`,
      (root) => {
        root.querySelector('[data-action="done"]')!.addEventListener('click', () => {
          this.ctx.overlay.clear();
          this.ctx.pop({ kind: 'runSummary', result: { strokes: n, par: this.map.par, claimed: this.run.claimedHexes.size } });
        });
      },
    );
  }

  // ---- flight animation ------------------------------------------------------------

  private buildAnim(o: ShotOutcome): FlightAnim {
    const pts: FlightAnim['pts'] = [];
    const groundIso = (h: Axial): Vec2 => axialToIso(h, cellAt(this.map, h)?.elevation ?? 0);
    let at = 0;
    const perSample = 1000 / (FLIGHT_ANIM.hexesPerSec * BALLISTICS.samplesPerHex);
    const from = groundIso(o.path[0] ?? o.landingHex);
    pts.push({ p: from, shadow: from, hex: o.path[0] ?? o.landingHex, h: 0, at });
    for (const s of o.flightSamples) {
      at += perSample;
      const ground = cellAt(this.map, s.hex)?.elevation ?? 0;
      pts.push({
        p: { x: s.x, y: s.y * HEX.ySquash - s.h * HEX.elevPx },
        shadow: { x: s.x, y: s.y * HEX.ySquash - ground * HEX.elevPx },
        hex: s.hex,
        h: s.h - ground,
        at,
      });
    }
    // Ground phase: landing (or drop-back after a strike), then the roll.
    const groundHexes = o.flightSamples.length ? [o.landingHex, ...o.rollPath] : o.path.slice(1);
    if (o.flightSamples.length && !hexEq(o.restHex, o.landingHex) && o.rollPath.length === 0) groundHexes.push(o.restHex);
    const perHex = 1000 / FLIGHT_ANIM.rollHexesPerSec;
    for (const h of groundHexes) {
      const last = pts[pts.length - 1];
      if (hexEq(last.hex, h) && last.h === 0) continue;
      at += perHex * (last.h > 0 ? 0.5 : 1);
      const g = groundIso(h);
      pts.push({ p: g, shadow: g, hex: h, h: 0, at });
    }
    return { pts, totalMs: at + FLIGHT_ANIM.settleMs };
  }

  private flightPoint(anim: FlightAnim, t: number): FlightAnim['pts'][number] {
    const pts = anim.pts;
    if (t <= 0) return pts[0];
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i].at) {
        const a = pts[i - 1];
        const b = pts[i];
        const u = b.at === a.at ? 1 : (t - a.at) / (b.at - a.at);
        return {
          p: lerp(a.p, b.p, u),
          shadow: lerp(a.shadow, b.shadow, u),
          hex: u < 0.5 ? a.hex : b.hex,
          h: a.h + (b.h - a.h) * u,
          at: t,
        };
      }
    }
    return pts[pts.length - 1];
  }

  // ---- input ---------------------------------------------------------------------------

  handlePointer(e: PointerEvt): void {
    if (this.mode.kind === 'swing') {
      if (e.type === 'down') {
        this.mode.meter = meterTap(this.mode.cfg, this.mode.meter, this.clock);
        if (this.mode.meter.phase === 'done') this.commitSwing();
      }
      return;
    }
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

  private nearTargetMarker(screen: Vec2): boolean {
    const m = this.mode;
    if (m.kind !== 'aim' || !m.target) return false;
    const s = this.camera.worldToScreen(axialToIso(m.target, cellAt(this.map, m.target)!.elevation), this.lastView);
    return Math.hypot(s.x - screen.x, s.y - screen.y) <= AIM.markerGrabPx;
  }

  private dragTarget(screen: Vec2, end = false): void {
    if (this.mode.kind !== 'aim') return;
    const h = this.pick(screen);
    this.mode.dragging = !end;
    if (h && !hexEq(h, this.run.ballHex) && !(this.mode.target && hexEq(h, this.mode.target))) this.setAim({ target: h });
    else if (end) this.renderPanel();
  }

  private tap(screen: Vec2): void {
    const m = this.mode;
    if (m.kind === 'flight') {
      m.t = m.anim.totalMs;
      return;
    }
    if (m.kind === 'holed') return;
    const h = this.pick(screen);
    if (!h) return;
    if (m.kind === 'aim') {
      if (hexEq(h, this.run.ballHex)) return;
      this.setAim({ target: h });
      return;
    }
    // traverse
    if (this.walk) {
      const from = this.walk.path[this.walk.idx];
      const r = findPath(this.map, from, h, { cleared: this.run.clearedHexes });
      if (r.path.length > 1) this.walk = { path: r.path, idx: 1, t: 0, msPerHex: MOVE.walkMsPerHex };
      return;
    }
    if (hexEq(h, this.run.partyHex)) {
      if (this.onBall()) this.enterAim();
      return;
    }
    this.walkTo(h);
  }

  private walkTo(h: Axial): void {
    if (this.mode.kind !== 'traverse') return;
    const from = this.walk ? this.walk.path[this.walk.idx] : this.run.partyHex;
    if (hexEq(h, from)) return;
    const r = findPath(this.map, from, h, { cleared: this.run.clearedHexes });
    if (r.path.length < 2) {
      this.preview = [];
      return;
    }
    this.preview = r.path;
    this.previewCost = r.cost;
    this.walk = { path: r.path, idx: 1, t: 0, msPerHex: MOVE.walkMsPerHex };
    this.renderPanel();
  }

  // ---- sim -------------------------------------------------------------------------------

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
          this.refreshUi();
          break;
        }
      }
      this.camera.follow(this.partyIso());
    }
    if (this.mode.kind === 'swing') {
      this.mode.meter = meterTick(this.mode.cfg, this.mode.meter, this.clock);
      if (this.mode.meter.phase === 'done') this.commitSwing();
    }
    if (this.mode.kind === 'flight') {
      const m = this.mode;
      m.t += dtMs;
      const pt = this.flightPoint(m.anim, m.t);
      this.camera.follow(pt.shadow);
      if (m.t >= m.anim.totalMs && !m.done) {
        m.done = true;
        this.finishFlight();
      }
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

  // ---- render ------------------------------------------------------------------------------

  render(g: CanvasRenderingContext2D, view: SceneView, _alpha: number): void {
    this.lastView = view;
    if (!this.rc || this.rcCanvas !== g.canvas) {
      this.rc = rough.canvas(g.canvas);
      this.rcCanvas = g.canvas;
    }
    if (!this.terrain) return;
    if (!this.fog || this.fogFor !== this.run.clearedHexes) {
      this.fog = this.renderer.bakeFog(this.run.clearedHexes);
      this.fogFor = this.run.clearedHexes;
    }

    g.fillStyle = ISO_COLORS.groundPaper;
    g.fillRect(0, 0, view.width, view.height);

    g.save();
    g.translate(view.width / 2, view.height / 2);
    g.scale(this.camera.zoom, this.camera.zoom);
    g.translate(-this.camera.center.x, -this.camera.center.y);

    this.renderer.blit(g, this.terrain);
    this.drawPathPreview(g);
    this.drawAimPreview(g);
    this.renderer.blit(g, this.fog);
    this.drawFlag(g);
    // Depth: whichever of party / ball is further back draws first.
    const ballRow = this.ballDrawRow();
    const partyRow = this.walk ? Math.max(this.walk.path[this.walk.idx].r, this.run.partyHex.r) : this.run.partyHex.r;
    if (ballRow <= partyRow) {
      this.drawBall(g);
      this.drawParty(g);
    } else {
      this.drawParty(g);
      this.drawBall(g);
    }
    this.drawAimMarker(g);
    this.drawHover(g);

    g.restore();

    // Screen-space HUD: the swing meter (live, then lingering over the flight).
    const m = this.mode;
    if (m.kind === 'swing') drawMeter(g, view, m.cfg, m.meter, this.clock, m.targetPower, clubDef(m.input.club).name);
    else if (m.kind === 'flight' && this.lastMeter && this.clock < this.lastMeter.until)
      drawMeter(g, view, this.lastMeter.cfg, this.lastMeter.state, this.clock, this.lastMeter.targetPower, this.lastMeter.club);
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

  /** Aim preview: the corridor the shot would clear (top faces, faint), the
   *  mean path, the dispersion ring at the predicted landing. Drawn under
   *  the fog so fogged ground stays fogged (the ring is the promise, not a
   *  reveal). */
  private drawAimPreview(g: CanvasRenderingContext2D): void {
    const m = this.mode.kind === 'swing' ? { kind: 'aim' as const, ...this.mode.input, dragging: false } : this.mode;
    const o = this.aimPreview;
    if (m.kind !== 'aim' || !o || !m.target) return;
    g.save();
    g.strokeStyle = COLORS.accent;
    g.fillStyle = COLORS.accent;
    g.lineWidth = 1;
    g.globalAlpha = 0.14;
    for (const h of o.clearedPath) {
      const cell = cellAt(this.map, h);
      if (!cell) continue;
      const f = this.renderer.faces(cell);
      g.beginPath();
      f.top.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.closePath();
      g.fill();
    }
    // Mean flight line: the arc's ground track (smooth), then the roll.
    g.globalAlpha = 0.8;
    g.setLineDash([4, 4]);
    g.lineWidth = 1.3;
    g.beginPath();
    const start = axialToIso(this.run.ballHex, cellAt(this.map, this.run.ballHex)!.elevation);
    g.moveTo(start.x, start.y);
    for (const smp of o.flightSamples) {
      const ground = cellAt(this.map, smp.hex)?.elevation ?? 0;
      g.lineTo(smp.x, smp.y * HEX.ySquash - ground * HEX.elevPx);
    }
    const tail = o.flightSamples.length ? [o.landingHex, ...o.rollPath] : o.path.slice(1);
    for (const h of tail) {
      const p = axialToIso(h, cellAt(this.map, h)!.elevation);
      g.lineTo(p.x, p.y);
    }
    g.stroke();
    g.setLineDash([]);
    // Dispersion ring (iso ellipse) at the predicted landing.
    const lie = lieOf(this.map, this.run.ballHex);
    const r = Math.max(0.35, dispersionHexes(clubDef(m.club), m.shape, m.spin, lie)) * HEX_W;
    const lc = axialToIso(o.landingHex, cellAt(this.map, o.landingHex)!.elevation);
    g.lineWidth = 1.4;
    g.beginPath();
    g.ellipse(lc.x, lc.y, r, r * HEX.ySquash, 0, 0, Math.PI * 2);
    g.stroke();
    // Rest marker.
    const rc = axialToIso(o.restHex, cellAt(this.map, o.restHex)!.elevation);
    g.beginPath();
    g.arc(rc.x, rc.y, 3.5, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  private drawAimMarker(g: CanvasRenderingContext2D): void {
    const m = this.mode.kind === 'swing' ? { kind: 'aim' as const, target: this.mode.input.target, dragging: false } : this.mode;
    if (m.kind !== 'aim' || !m.target) return;
    const p = axialToIso(m.target, cellAt(this.map, m.target)!.elevation);
    g.save();
    g.strokeStyle = COLORS.accent;
    g.lineWidth = m.dragging ? 2.2 : 1.6;
    g.beginPath();
    g.ellipse(p.x, p.y, 9, 9 * HEX.ySquash, 0, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.moveTo(p.x - 13, p.y);
    g.lineTo(p.x + 13, p.y);
    g.moveTo(p.x, p.y - 8);
    g.lineTo(p.x, p.y + 8);
    g.stroke();
    g.restore();
  }

  private drawFlag(g: CanvasRenderingContext2D): void {
    const pin = this.map.pin;
    const p = axialToIso(pin, cellAt(this.map, pin)!.elevation);
    g.save();
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(p.x, p.y);
    g.lineTo(p.x, p.y - 30);
    g.stroke();
    g.fillStyle = COLORS.accent;
    g.beginPath();
    g.moveTo(p.x, p.y - 30);
    g.lineTo(p.x + 13, p.y - 25);
    g.lineTo(p.x, p.y - 20);
    g.closePath();
    g.fill();
    g.restore();
    this.renderer.drawOccluders(g, this.rc!, spriteBBox(p, 14, 32, 4), pin.r, this.run.clearedHexes);
  }

  private ballDrawRow(): number {
    if (this.mode.kind === 'flight') return this.flightPoint(this.mode.anim, this.mode.t).hex.r;
    return this.run.ballHex.r;
  }

  private drawBall(g: CanvasRenderingContext2D): void {
    let p: Vec2;
    let shadow: Vec2;
    let h = 0;
    let row: number;
    if (this.mode.kind === 'flight') {
      const pt = this.flightPoint(this.mode.anim, this.mode.t);
      p = pt.p;
      shadow = pt.shadow;
      h = pt.h;
      row = pt.hex.r;
    } else {
      if (this.run.holed) return;
      if (this.onBall() && !this.walk) return; // the figure stands on it
      p = axialToIso(this.run.ballHex, cellAt(this.map, this.run.ballHex)!.elevation);
      shadow = p;
      row = this.run.ballHex.r;
    }
    g.save();
    if (h > 0.05) {
      g.fillStyle = 'rgba(43,40,34,0.22)';
      g.beginPath();
      g.ellipse(shadow.x, shadow.y + 2, 5, 2.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    const r = FLIGHT_ANIM.ballRadius * (1 + Math.max(0, h) * FLIGHT_ANIM.heightScale);
    g.fillStyle = ISO_COLORS.ball;
    g.strokeStyle = COLORS.ink;
    g.lineWidth = 1.1;
    g.beginPath();
    g.arc(p.x, p.y - 2, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.restore();
    const bb = spriteBBox(shadow, 10, Math.max(12, shadow.y - p.y + 10), 6);
    this.renderer.drawOccluders(g, this.rc!, bb, row, this.run.clearedHexes);
  }

  private drawParty(g: CanvasRenderingContext2D): void {
    const p = this.partyIso();
    // Stand-in figure until character sprites land: a top-hatted ink
    // silhouette with a bone face — the Caddy is a step behind.
    this.drawFigure(g, p.x, p.y, 1, seedFrom('player'));
    const behind = this.trailPoint();
    this.drawFigure(g, behind.x, behind.y, 0.85, seedFrom('caddy'));
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
    if (!this.hover || this.mode.kind === 'flight' || this.mode.kind === 'swing') return;
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

  // Exposed for the prototype/E2E harness.
  get debugState() {
    const m = this.mode;
    return {
      mode: m.kind,
      party: this.run.partyHex,
      key: hexKey(this.run.partyHex),
      partyScreen: this.camera.worldToScreen(this.partyIso(), this.lastView),
      ball: this.run.ballHex,
      ballKey: hexKey(this.run.ballHex),
      strokes: this.run.strokes,
      holed: this.run.holed,
      cleared: this.run.clearedHexes.size,
      claimed: this.run.claimedHexes.size,
      target: m.kind === 'aim' && m.target ? hexKey(m.target) : m.kind === 'swing' ? hexKey(m.input.target) : null,
      meter: m.kind === 'swing' ? m.meter.phase : null,
      sweepMs: m.kind === 'swing' ? m.cfg.sweepMs : null,
      zoom: this.camera.zoom,
      center: { ...this.camera.center },
      walking: this.walk !== null,
    };
  }
}

const SHAPE_LABEL: Record<ShotShape, string> = { standard: 'Full', punch: 'Punch', flop: 'Flop', bumpRun: 'Bump & run' };

function lerp(a: Vec2, b: Vec2, u: number): Vec2 {
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
