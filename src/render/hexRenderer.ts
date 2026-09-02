import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Drawable, Options } from 'roughjs/bin/core';
import { COLORS, HEX_ART, ISO_COLORS, TERRAIN_COLORS } from '../core/config';
import { DEBUG } from '../core/debug';
import type { Vec2 } from '../core/types';
import { hexKey, isoCorners, type HexKey } from '../hex/coords';
import { drawOrder, type HexCell, type HoleMap, type TerrainKind } from '../hex/map';
import { prismBounds, prismFaces, prismSilhouette, type PrismFaces } from '../hex/prism';
import { seedFrom } from './roughCache';

/** Isometric prism renderer (PLAN.md §Hex engine). Every cell is drawn as an
 *  exact-filled top face + side faces (so adjacent tiles never show paper
 *  through hand-drawn gaps), then rough.js linework on top: outlines and the
 *  style board's terrain motifs (scratch lines, dots, waves, tree blobs). All
 *  rough drawables are generated once per cell in cell-local coordinates
 *  with a seed from the cell key — stable, no boiling — and replayed.
 *
 *  Two face styles exist for the P1 art-risk prototype: 'flat' (board look —
 *  pale flats + sparse motifs) and 'hachure' (rough.js hachure fill over the
 *  flat, per-terrain angle). The winner becomes the default; the loser stays
 *  one line away as the fallback. */

export type FaceStyle = 'flat' | 'hachure';

export interface RendererOptions {
  faceStyle: FaceStyle;
}

export interface LayerBake {
  canvas: HTMLCanvasElement;
  /** World px per bake px is 1/scale. */
  scale: number;
  /** Iso-world coords of the bake's top-left corner. */
  originX: number;
  originY: number;
  /** World-size of the bake. */
  width: number;
  height: number;
}

const gen = rough.generator();
const BAKE_MARGIN = 48; // world px; canopies/flag protrude above their cell

/** Tiny render-only PRNG for motif placement (deterministic per cell key). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inkAlpha(alpha: number): string {
  return `rgba(43, 40, 34, ${alpha})`;
}

interface CellArt {
  faces: PrismFaces;
  /** Rough drawables in ABSOLUTE iso-world coords, draw order. */
  ink: Drawable[];
  /** Canvas-drawn dots (sand/cart path) — cheaper than rough dots. */
  dots: Array<{ x: number; y: number; r: number; color: string }>;
  fog: Drawable[];
}

export class HexRenderer {
  private order: HexCell[];
  private art = new Map<HexKey, CellArt>();
  private sil = new Map<HexKey, Vec2[]>();

  constructor(
    private map: HoleMap,
    private opts: RendererOptions = { faceStyle: 'flat' },
  ) {
    this.order = drawOrder(map);
    for (const cell of this.order) {
      const a = this.buildCell(cell);
      this.art.set(hexKey(cell.coord), a);
      this.sil.set(hexKey(cell.coord), prismSilhouette(a.faces));
    }
  }

  get faceStyle(): FaceStyle {
    return this.opts.faceStyle;
  }

  cells(): readonly HexCell[] {
    return this.order;
  }

  faces(cell: HexCell): PrismFaces {
    return this.art.get(hexKey(cell.coord))!.faces;
  }

  // ---- bakes -----------------------------------------------------------------

  private makeLayer(): LayerBake {
    const b = this.map.worldBounds;
    const width = b.maxX - b.minX + BAKE_MARGIN * 2;
    const height = b.maxY - b.minY + BAKE_MARGIN * 2;
    const scale = HEX_ART.bakeScale;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    return { canvas, scale, originX: b.minX - BAKE_MARGIN, originY: b.minY - BAKE_MARGIN, width, height };
  }

  private enterLayer(layer: LayerBake): { g: CanvasRenderingContext2D; rc: RoughCanvas } {
    const g = layer.canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    g.scale(layer.scale, layer.scale);
    g.translate(-layer.originX, -layer.originY);
    return { g, rc: rough.canvas(layer.canvas) };
  }

  /** Whole-hole terrain bake, painter's order back-to-front. */
  bakeTerrain(): LayerBake {
    const layer = this.makeLayer();
    const { g, rc } = this.enterLayer(layer);
    for (const cell of this.order) this.drawCell(g, rc, cell);
    if (DEBUG.drawOrder) this.drawOrderDebug(g);
    return layer;
  }

  /** Fog layer: fogged cells get a paper wash over their prism plus mist
   *  scribbles; cleared cells punch their silhouette out — both in painter's
   *  order, so a cleared cell in front clears the wash of a fogged cell
   *  behind it and a fogged cell in front re-covers a cleared one behind. */
  bakeFog(cleared: ReadonlySet<HexKey>): LayerBake {
    const layer = this.makeLayer();
    const { g, rc } = this.enterLayer(layer);
    // Pass 1 — coverage. Silhouettes overlap where a side face hangs over the
    // neighbour's top, so they are unioned at full alpha and the whole layer
    // is scaled to the wash alpha once (per-cell alpha double-washed those
    // strips into pale diagonal bands).
    for (const cell of this.order) {
      if (cleared.has(hexKey(cell.coord))) this.punchCell(g, cell);
      else if (!DEBUG.noWash) fillPoly(g, this.sil.get(hexKey(cell.coord))!, COLORS.paper);
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.globalAlpha = HEX_ART.fogWashAlpha;
    g.fillStyle = '#000';
    g.fillRect(0, 0, layer.canvas.width, layer.canvas.height);
    g.restore();
    // Pass 2 — mist, with cleared cells in front still punching what creeps
    // over them (the wash under a cleared cell is already gone).
    if (!DEBUG.noMist) {
      for (const cell of this.order) {
        if (cleared.has(hexKey(cell.coord))) this.punchCell(g, cell);
        else for (const d of this.art.get(hexKey(cell.coord))!.fog) rc.draw(d);
      }
    }
    return layer;
  }

  blit(g: CanvasRenderingContext2D, layer: LayerBake): void {
    g.drawImage(layer.canvas, layer.originX, layer.originY, layer.width, layer.height);
  }

  // ---- per-cell drawing (iso-world coordinates) ------------------------------

  drawCell(g: CanvasRenderingContext2D, rc: RoughCanvas, cell: HexCell): void {
    const a = this.art.get(hexKey(cell.coord))!;
    const f = a.faces;
    // Exact fills first (no paper gaps), then linework.
    if (f.sw) fillPoly(g, f.sw, ISO_COLORS.side);
    if (f.se) fillPoly(g, f.se, ISO_COLORS.sideDark);
    fillPoly(g, f.top, TERRAIN_COLORS[cell.terrain]);
    for (const d of a.ink) rc.draw(d);
    for (const d of a.dots) {
      g.fillStyle = d.color;
      g.beginPath();
      g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      g.fill();
    }
  }

  drawFogCell(g: CanvasRenderingContext2D, rc: RoughCanvas, cell: HexCell): void {
    const a = this.art.get(hexKey(cell.coord))!;
    if (!DEBUG.noWash) {
      g.globalAlpha = HEX_ART.fogWashAlpha;
      fillPoly(g, this.sil.get(hexKey(cell.coord))!, COLORS.paper);
      g.globalAlpha = 1;
    }
    if (!DEBUG.noMist) for (const d of a.fog) rc.draw(d);
  }

  punchCell(g: CanvasRenderingContext2D, cell: HexCell): void {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    fillPoly(g, this.sil.get(hexKey(cell.coord))!, '#000');
    g.restore();
  }

  /** Dynamic-layer depth: after drawing a sprite standing on `row`, re-draw
   *  every cell in front of it (greater r) whose prism overlaps the sprite's
   *  iso bbox, terrain then fog, so raised ground in front hides the sprite.
   *  Cells are few and cached, so this is cheap per frame. */
  drawOccluders(
    g: CanvasRenderingContext2D,
    rc: RoughCanvas,
    bbox: { minX: number; minY: number; maxX: number; maxY: number },
    row: number,
    cleared: ReadonlySet<HexKey>,
  ): void {
    for (const cell of this.order) {
      if (cell.coord.r <= row) continue;
      const pb = prismBounds(this.faces(cell));
      if (pb.maxX < bbox.minX || pb.minX > bbox.maxX || pb.maxY < bbox.minY || pb.minY > bbox.maxY) continue;
      this.drawCell(g, rc, cell);
      if (!cleared.has(hexKey(cell.coord))) this.drawFogCell(g, rc, cell);
    }
  }

  private drawOrderDebug(g: CanvasRenderingContext2D): void {
    g.font = '9px Georgia';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    this.order.forEach((cell, i) => {
      const f = this.faces(cell);
      g.strokeStyle = COLORS.accent;
      g.lineWidth = 0.8;
      strokePoly(g, f.top);
      g.fillStyle = COLORS.accent;
      g.fillText(String(i), f.center.x, f.center.y);
    });
  }

  // ---- drawable generation ---------------------------------------------------

  private buildCell(cell: HexCell): CellArt {
    const key = hexKey(cell.coord);
    const faces = prismFaces(this.map, cell);
    const rnd = mulberry32(seedFrom(`${this.map.seed}:${key}`));
    const seed = seedFrom(`ink:${key}`);
    const ink: Drawable[] = [];
    const dots: CellArt['dots'] = [];
    const c = faces.center;
    const line = (opt: Options = {}): Options => ({
      roughness: HEX_ART.roughness,
      seed,
      stroke: COLORS.ink,
      strokeWidth: HEX_ART.inkWidth,
      ...opt,
    });

    // Side faces: outline (+ vertical hachure in that style).
    for (const side of [faces.sw, faces.se]) {
      if (!side) continue;
      const pts = side.map((p) => [p.x, p.y] as [number, number]);
      if (this.opts.faceStyle === 'hachure') {
        ink.push(
          gen.polygon(pts, {
            ...line({ strokeWidth: HEX_ART.sideInkWidth }),
            fill: inkAlpha(0.35),
            fillStyle: 'hachure',
            hachureAngle: 90,
            hachureGap: 4.5,
            fillWeight: 0.55,
          }),
        );
      } else {
        ink.push(gen.polygon(pts, { ...line({ strokeWidth: HEX_ART.sideInkWidth }), fill: undefined }));
      }
    }

    // Top face outline (+ hachure texture in that style).
    const topPts = faces.top.map((p) => [p.x, p.y] as [number, number]);
    if (this.opts.faceStyle === 'hachure') {
      const h = HACHURE[cell.terrain];
      ink.push(
        gen.polygon(topPts, {
          ...line(),
          fill: inkAlpha(h.alpha),
          fillStyle: h.style,
          hachureAngle: h.angle,
          hachureGap: h.gap,
          fillWeight: 0.5,
        }),
      );
    } else {
      ink.push(gen.polygon(topPts, { ...line(), fill: undefined }));
      this.motifs(cell, c, rnd, seed, ink, dots);
    }

    // Landmarks: the pin's flag (the scene's one red), tee markers in ink.
    if (cell.coord.q === this.map.pin.q && cell.coord.r === this.map.pin.r) {
      const cx = c.x + 6;
      const cy = c.y + 3;
      ink.push(gen.ellipse(cx, cy, 9, 6, { ...line({ strokeWidth: 1.1 }), fill: ISO_COLORS.groundPaper, fillStyle: 'solid' }));
      ink.push(gen.line(cx, cy, cx, cy - 38, line({ strokeWidth: 1.4, roughness: 0.4 })));
      ink.push(
        gen.polygon(
          [
            [cx, cy - 38],
            [cx + 20, cy - 33],
            [cx, cy - 27],
          ],
          { ...line({ strokeWidth: 0.9 }), fill: COLORS.accent, fillStyle: 'solid' },
        ),
      );
    }
    if (cell.coord.q === this.map.tee.q && cell.coord.r === this.map.tee.r) {
      dots.push({ x: c.x - 8, y: c.y, r: 1.6, color: COLORS.ink }, { x: c.x + 8, y: c.y, r: 1.6, color: COLORS.ink });
    }

    // Fog: mist scribbles across the top face (extend a little past the
    // edges so mist creeps into cleared neighbours).
    const fog: Drawable[] = [];
    const hw = isoCorners()[1].x;
    const hy = isoCorners()[3].y;
    const fogSeed = seedFrom(`fog:${key}`);
    const mistLines = 1 + (rnd() < HEX_ART.fogMistSecondChance ? 1 : 0);
    for (let i = 0; i < mistLines; i++) {
      const y0 = c.y + (rnd() - 0.5) * hy * 1.3;
      const x0 = c.x - hw * (1.3 + rnd() * 0.6);
      const x1 = c.x + hw * (1.3 + rnd() * 0.6);
      const pts: [number, number][] = [];
      const n = 9;
      const amp = 1.8 + rnd() * 1.6;
      const phase = rnd() * Math.PI * 2;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        pts.push([x0 + (x1 - x0) * t, y0 + Math.sin(phase + t * Math.PI * 2.6) * amp]);
      }
      fog.push(
        gen.curve(pts, {
          seed: fogSeed + i,
          roughness: 1.1,
          stroke: inkAlpha(HEX_ART.fogMistAlpha),
          strokeWidth: HEX_ART.scratchWidth,
        }),
      );
    }

    return { faces, ink, dots, fog };
  }

  /** Style-board motifs for the 'flat' style. Cell-local jitter comes from
   *  the render PRNG; rough's own seed keeps strokes stable. */
  private motifs(
    cell: HexCell,
    c: Vec2,
    rnd: () => number,
    seed: number,
    ink: Drawable[],
    dots: CellArt['dots'],
  ): void {
    const hw = isoCorners()[1].x; // 36.4
    const hy = isoCorners()[3].y; // 23.5
    const scratch = (x1: number, y1: number, x2: number, y2: number, alpha: number = HEX_ART.scratchAlpha) =>
      gen.line(c.x + x1, c.y + y1, c.x + x2, c.y + y2, {
        seed: seed + ink.length,
        roughness: 0.6,
        stroke: inkAlpha(alpha),
        strokeWidth: HEX_ART.scratchWidth,
      });
    const j = (amt: number) => (rnd() - 0.5) * amt;

    switch (cell.terrain) {
      case 'fairway':
      case 'tee': {
        const n = 1 + (rnd() < 0.6 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const y = (i === 0 ? -5 : 5) + j(4);
          const len = hw * (0.45 + rnd() * 0.3);
          const x = j(hw * 0.4);
          ink.push(scratch(x - len, y, x + len, y));
        }
        break;
      }
      case 'rough': {
        for (let i = 0; i < 4; i++) {
          const x = -hw * 0.6 + j(hw * 0.6);
          const y = -hy * 0.5 + i * hy * 0.3 + j(3);
          const len = 14 + rnd() * 14;
          ink.push(scratch(x, y, x + len, y + len * 0.33));
        }
        break;
      }
      case 'deepRough': {
        for (let i = 0; i < 5; i++) {
          const x = -hw * 0.65 + j(hw * 0.6);
          const y = -hy * 0.5 + i * hy * 0.24 + j(3);
          const len = 14 + rnd() * 14;
          ink.push(scratch(x, y, x + len, y + len * 0.36, 0.65));
        }
        break;
      }
      case 'green': {
        for (let i = 0; i < 3; i++) {
          const y = -hy * 0.35 + i * hy * 0.32 + j(1.5);
          const len = hw * (0.55 + rnd() * 0.2);
          ink.push(scratch(-len, y, len, y, 0.42));
        }
        break;
      }
      case 'sand': {
        const n = 4 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) {
          dots.push({ x: c.x + j(hw * 1.1), y: c.y + j(hy * 0.9), r: 0.9, color: inkAlpha(0.4) });
        }
        break;
      }
      case 'cartPath': {
        const n = 3 + Math.floor(rnd() * 2);
        for (let i = 0; i < n; i++) {
          dots.push({ x: c.x + j(hw * 1.1), y: c.y + j(hy * 0.9), r: 0.95, color: 'rgba(107, 100, 85, 0.7)' });
        }
        break;
      }
      case 'water': {
        for (let i = 0; i < 3; i++) {
          const y = -hy * 0.45 + i * hy * 0.4 + j(2);
          const x0 = -hw * 0.6 + j(hw * 0.3);
          const len = 22 + rnd() * 14;
          const pts: [number, number][] = [];
          for (let k = 0; k <= 6; k++) {
            const t = k / 6;
            pts.push([c.x + x0 + len * t, c.y + y + Math.sin(t * Math.PI * 2) * 2.2]);
          }
          ink.push(
            gen.curve(pts, {
              seed: seed + ink.length,
              roughness: 0.5,
              stroke: inkAlpha(HEX_ART.scratchAlpha),
              strokeWidth: HEX_ART.scratchWidth,
            }),
          );
        }
        break;
      }
      case 'trees': {
        const n = rnd() < 0.35 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const tx = n === 1 ? j(10) : (i === 0 ? -11 : 11) + j(5);
          const ty = 4 + j(5);
          const rx = 7 + rnd() * 2.5;
          const ry = 8 + rnd() * 3;
          ink.push(gen.line(c.x + tx, c.y + ty, c.x + tx, c.y + ty - 8, { seed: seed + i, roughness: 0.5, stroke: COLORS.ink, strokeWidth: 1.2 }));
          ink.push(
            gen.ellipse(c.x + tx, c.y + ty - 8 - ry * 0.7, rx * 2, ry * 2, {
              seed: seed + 10 + i,
              roughness: 0.9,
              stroke: COLORS.ink,
              strokeWidth: 0.9,
              fill: ISO_COLORS.canopy,
              fillStyle: 'solid',
            }),
          );
        }
        break;
      }
      case 'oob': {
        if (rnd() < 0.3) {
          const x = j(hw * 0.8);
          ink.push(gen.line(c.x + x, c.y + 6, c.x + x, c.y - 8, { seed, roughness: 0.4, stroke: COLORS.ink, strokeWidth: 1.2 }));
          ink.push(
            gen.polygon(
              [
                [c.x + x, c.y - 8],
                [c.x + x + 6, c.y - 6],
                [c.x + x, c.y - 4],
              ],
              { seed, roughness: 0.4, stroke: COLORS.ink, strokeWidth: 0.7, fill: undefined },
            ),
          );
        }
        break;
      }
    }
  }
}

/** Hachure-style parameters per terrain (prototype variant). */
const HACHURE: Record<TerrainKind, { style: Options['fillStyle']; angle: number; gap: number; alpha: number }> = {
  tee: { style: 'hachure', angle: 0, gap: 7, alpha: 0.25 },
  fairway: { style: 'hachure', angle: 0, gap: 8, alpha: 0.22 },
  rough: { style: 'hachure', angle: 25, gap: 5.5, alpha: 0.35 },
  deepRough: { style: 'cross-hatch', angle: 25, gap: 5.5, alpha: 0.4 },
  sand: { style: 'dots', angle: 0, gap: 6, alpha: 0.3 },
  water: { style: 'zigzag-line', angle: 0, gap: 6, alpha: 0.32 },
  trees: { style: 'cross-hatch', angle: 60, gap: 5, alpha: 0.4 },
  green: { style: 'hachure', angle: 0, gap: 3.5, alpha: 0.3 },
  cartPath: { style: 'dots', angle: 0, gap: 8, alpha: 0.35 },
  oob: { style: 'hachure', angle: 45, gap: 12, alpha: 0.12 },
};

function fillPoly(g: CanvasRenderingContext2D, pts: readonly Vec2[], color: string): void {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fill();
}

function strokePoly(g: CanvasRenderingContext2D, pts: readonly Vec2[]): void {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.stroke();
}

/** Screen-space bbox of a standing sprite (avatar/ball) at an iso point. */
export function spriteBBox(p: Vec2, halfW = 18, up = 44, down = 10) {
  return { minX: p.x - halfW, maxX: p.x + halfW, minY: p.y - up, maxY: p.y + down };
}


