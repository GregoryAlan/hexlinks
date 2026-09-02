import { HEX, HEX_ART } from '../core/config';
import type { Vec2 } from '../core/types';
import { axialToIso, isoCorners, type Axial } from './coords';
import { elevationAt, type HexCell, type HoleMap } from './map';

/** Pure iso-prism geometry (no canvas). Each cell is a top face plus up to
 *  two visible side faces hanging under its SW and SE edges — the edges that
 *  face the viewer. A face's height is the elevation drop to the neighbour
 *  under that edge; where the neighbour is as high or higher the face is
 *  hidden behind the neighbour's top and is omitted. Map edges get a small
 *  "board" lip so ground-level cells still read as tiles. */

export interface PrismFaces {
  /** Iso-world center of the top face. */
  center: Vec2;
  /** Absolute iso-world polygon, N → clockwise. */
  top: Vec2[];
  /** Absolute quads; undefined when hidden. */
  sw?: Vec2[];
  se?: Vec2[];
  /** Heights used (px) — the cache key ingredients. */
  swHeight: number;
  seHeight: number;
  /** Lowest y reached by any face (for bounds / occluder tests). */
  bottomY: number;
}

/** Neighbour directions under the two visible edges (pointy-top axial). */
export const SW_DIR: Axial = { q: -1, r: 1 };
export const SE_DIR: Axial = { q: 0, r: 1 };

export function faceHeight(elev: number, neighbourElev: number | undefined): number {
  if (neighbourElev === undefined) return elev * HEX.elevPx + HEX_ART.edgeLipPx;
  return Math.max(0, elev - neighbourElev) * HEX.elevPx;
}

export function prismFaces(map: HoleMap, cell: HexCell): PrismFaces {
  const center = axialToIso(cell.coord, cell.elevation);
  const c = isoCorners();
  const top = c.map((p) => ({ x: center.x + p.x, y: center.y + p.y }));
  const [, , SE, S, SW] = top;
  const swH = faceHeight(
    cell.elevation,
    elevationAt(map, { q: cell.coord.q + SW_DIR.q, r: cell.coord.r + SW_DIR.r }),
  );
  const seH = faceHeight(
    cell.elevation,
    elevationAt(map, { q: cell.coord.q + SE_DIR.q, r: cell.coord.r + SE_DIR.r }),
  );
  const faces: PrismFaces = {
    center,
    top,
    swHeight: swH,
    seHeight: seH,
    bottomY: S.y + Math.max(swH, seH),
  };
  if (swH > 0) faces.sw = [SW, S, { x: S.x, y: S.y + swH }, { x: SW.x, y: SW.y + swH }];
  if (seH > 0) faces.se = [S, SE, { x: SE.x, y: SE.y + seH }, { x: S.x, y: S.y + seH }];
  return faces;
}

/** Axis-aligned iso bbox of the whole prism silhouette. */
export function prismBounds(f: PrismFaces): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: f.top[4].x,
    maxX: f.top[1].x,
    minY: f.top[0].y,
    maxY: f.bottomY,
  };
}

/** Iso-world silhouette of the whole prism as one polygon (top face plus the
 *  hanging faces) — used for fog punch-outs. */
export function prismSilhouette(f: PrismFaces): Vec2[] {
  const [N, NE, SE, S, SW, NW] = f.top;
  const h = Math.max(f.swHeight, f.seHeight);
  if (h <= 0) return f.top;
  // Walk: N → NE → SE → SE+h → S+h → SW+h → SW → NW.
  return [
    N,
    NE,
    SE,
    { x: SE.x, y: SE.y + f.seHeight },
    { x: S.x, y: S.y + h },
    { x: SW.x, y: SW.y + f.swHeight },
    SW,
    NW,
  ];
}
