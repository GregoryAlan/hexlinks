import { HEX } from '../core/config';
import type { Vec2 } from '../core/types';
import { axialToIso, hexKey, isoCorners, parseKey, type Axial, type HexKey } from './coords';

export type TerrainKind =
  | 'tee'
  | 'fairway'
  | 'rough'
  | 'deepRough'
  | 'sand'
  | 'water'
  | 'trees'
  | 'green'
  | 'cartPath'
  | 'oob';

export interface HexCell {
  coord: Axial;
  terrain: TerrainKind;
  /** Integer 0..HEX.maxElevation. */
  elevation: number;
  /** Cell-local modifiers (P2+: pickups, hex effects). */
  modifiers?: string[];
}

export interface IsoBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface HoleMap {
  seed: string;
  name: string;
  par: number;
  cells: Map<HexKey, HexCell>;
  tee: Axial;
  pin: Axial;
  /** Iso-world extent of every prism (top faces at their elevation plus
   *  side faces down to ground). */
  worldBounds: IsoBounds;
}

export function cellAt(map: HoleMap, h: Axial): HexCell | undefined {
  return map.cells.get(hexKey(h));
}

export function elevationAt(map: HoleMap, h: Axial): number | undefined {
  return map.cells.get(hexKey(h))?.elevation;
}

/** Iso-world bounding box over all cells. */
export function computeBounds(cells: Iterable<HexCell>): IsoBounds {
  const c = isoCorners();
  const halfW = c[1].x;
  const halfH = c[3].y;
  const b: IsoBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const cell of cells) {
    const top = axialToIso(cell.coord, cell.elevation);
    const base = axialToIso(cell.coord, 0);
    b.minX = Math.min(b.minX, top.x - halfW);
    b.maxX = Math.max(b.maxX, top.x + halfW);
    b.minY = Math.min(b.minY, top.y - halfH);
    b.maxY = Math.max(b.maxY, base.y + halfH);
  }
  if (!Number.isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return b;
}

/** Painter's order for the iso projection: back rows first, then west→east.
 *  Because elevation lifts cells straight up the screen, everything a cell
 *  can overlap is either behind it (smaller r) or its own side faces hang
 *  over the row in front — so a plain row sort is exact. Same-row cells never
 *  overlap. */
export function drawOrder(map: HoleMap): HexCell[] {
  return [...map.cells.values()].sort((a, b) =>
    a.coord.r !== b.coord.r ? a.coord.r - b.coord.r : a.coord.q - b.coord.q,
  );
}

// ---- hand-authoring ----------------------------------------------------------

/** One glyph per terrain for ASCII-authored maps. */
export const TERRAIN_GLYPH: Record<string, TerrainKind> = {
  T: 'tee',
  F: 'fairway',
  R: 'rough',
  D: 'deepRough',
  S: 'sand',
  W: 'water',
  X: 'trees',
  G: 'green',
  P: 'cartPath',
  O: 'oob',
};

export interface AsciiMapSpec {
  seed: string;
  name: string;
  par: number;
  /** Rows of "<glyph><elevation digit>" pairs separated by spaces; "." skips
   *  a cell. Rows use odd-r offset layout (odd rows shoved right half a hex)
   *  so the text reads like the screen. */
  rows: string[];
  /** Offset-row coordinates (col, row) of tee and pin. */
  tee: [number, number];
  pin: [number, number];
}

/** odd-r offset → axial. */
export function offsetToAxial(col: number, row: number): Axial {
  return { q: col - (row - (row & 1)) / 2, r: row };
}

export function parseAsciiMap(spec: AsciiMapSpec): HoleMap {
  const cells = new Map<HexKey, HexCell>();
  spec.rows.forEach((line, row) => {
    const toks = line.trim().split(/\s+/);
    toks.forEach((tok, col) => {
      if (tok === '.' || tok === '') return;
      const terrain = TERRAIN_GLYPH[tok[0]];
      const elevation = Number(tok[1] ?? '0');
      if (!terrain || Number.isNaN(elevation)) throw new Error(`bad map token '${tok}' at ${col},${row}`);
      if (elevation < 0 || elevation > HEX.maxElevation) throw new Error(`elevation out of range at ${col},${row}`);
      const coord = offsetToAxial(col, row);
      cells.set(hexKey(coord), { coord, terrain, elevation });
    });
  });
  const tee = offsetToAxial(...spec.tee);
  const pin = offsetToAxial(...spec.pin);
  if (!cells.has(hexKey(tee))) throw new Error('tee is not on the map');
  if (!cells.has(hexKey(pin))) throw new Error('pin is not on the map');
  return {
    seed: spec.seed,
    name: spec.name,
    par: spec.par,
    cells,
    tee,
    pin,
    worldBounds: computeBounds(cells.values()),
  };
}

/** Iso-world center of a cell (its top face). */
export function cellCenter(cell: HexCell): Vec2 {
  return axialToIso(cell.coord, cell.elevation);
}

export function keysToAxials(keys: Iterable<HexKey>): Axial[] {
  return [...keys].map(parseKey);
}
