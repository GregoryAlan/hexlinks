import { HEX } from '../core/config';
import type { Vec2 } from '../core/types';

/** Axial hex coordinates, pointy-top, Red Blob conventions. Rows are `r`,
 *  holes run along +r (down the screen — portrait). No DOM, no matter. */
export interface Axial {
  q: number;
  r: number;
}

export type HexKey = string; // "q,r"

export function hexKey(h: Axial): HexKey {
  return `${h.q},${h.r}`;
}

export function parseKey(k: HexKey): Axial {
  const i = k.indexOf(',');
  return { q: Number(k.slice(0, i)), r: Number(k.slice(i + 1)) };
}

export function hexEq(a: Axial, b: Axial): boolean {
  return a.q === b.q && a.r === b.r;
}

/** Six neighbour directions, starting east and going counter-clockwise on
 *  screen (E, NE, NW, W, SW, SE). */
export const HEX_DIRS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function neighbors(h: Axial): Axial[] {
  return HEX_DIRS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** Cube-round of fractional axial coords. */
export function hexRound(q: number, r: number): Axial {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // `-rr - rs` can produce -0, which would key as "q,-0" — normalise.
  return { q: rq + 0, r: rr + 0 };
}

/** Contiguous line of hexes from a to b inclusive (lerp + round). The tiny
 *  epsilon nudge is Red Blob's trick to make ties deterministic. */
export function hexLine(a: Axial, b: Axial): Axial[] {
  const n = hexDistance(a, b);
  if (n === 0) return [{ ...a }];
  const out: Axial[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const q = a.q + 1e-6 + (b.q - a.q) * t;
    const r = a.r + 1e-6 + (b.r - a.r) * t;
    out.push(hexRound(q, r));
  }
  return out;
}

/** All hexes within `radius` of center (inclusive). */
export function hexRange(center: Axial, radius: number): Axial[] {
  const out: Axial[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const lo = Math.max(-radius, -dq - radius);
    const hi = Math.min(radius, -dq + radius);
    for (let dr = lo; dr <= hi; dr++) out.push({ q: center.q + dq, r: center.r + dr });
  }
  return out;
}

// ---- projection --------------------------------------------------------------

const SQRT3 = Math.sqrt(3);

/** Flat (top-down) world px of a hex center. */
export function axialToFlat(h: Axial): Vec2 {
  return {
    x: HEX.size * SQRT3 * (h.q + h.r / 2),
    y: HEX.size * 1.5 * h.r,
  };
}

export function flatToAxial(p: Vec2): Axial {
  const q = ((SQRT3 / 3) * p.x - (1 / 3) * p.y) / HEX.size;
  const r = ((2 / 3) * p.y) / HEX.size;
  return hexRound(q, r);
}

/** Iso-world px of a hex center at a given elevation: flat y squashed,
 *  elevation lifting straight up the screen. Iso-world is what the camera
 *  looks at (zoom/pan happen after this). */
export function axialToIso(h: Axial, elevation = 0): Vec2 {
  const f = axialToFlat(h);
  return { x: f.x, y: f.y * HEX.ySquash - elevation * HEX.elevPx };
}

/** Inverse of axialToIso for a KNOWN elevation. */
export function isoToAxial(p: Vec2, elevation = 0): Axial {
  return flatToAxial({ x: p.x, y: (p.y + elevation * HEX.elevPx) / HEX.ySquash });
}

/** The six corners of a top face, relative to the cell's iso center, starting
 *  at the top vertex and going clockwise on screen: N, NE, SE, S, SW, NW. */
export function isoCorners(scale = 1): Vec2[] {
  const w = HEX.size * SQRT3 * 0.5 * scale; // half width
  const hy = HEX.size * HEX.ySquash * scale; // half height (pointy)
  const my = hy * 0.5; // y of the side vertices
  return [
    { x: 0, y: -hy },
    { x: w, y: -my },
    { x: w, y: my },
    { x: 0, y: hy },
    { x: -w, y: my },
    { x: -w, y: -my },
  ];
}

/** Point-in-top-face test relative to a cell's iso center (convex hexagon
 *  via half-plane checks — no trig). */
export function inTopFace(local: Vec2): boolean {
  const w = HEX.size * SQRT3 * 0.5;
  const hy = HEX.size * HEX.ySquash;
  const my = hy * 0.5;
  const ax = Math.abs(local.x);
  const ay = Math.abs(local.y);
  if (ax > w || ay > hy) return false;
  // Pointy cap: the slanted edges run from (±w, my) to (0, hy).
  return ay <= my + (1 - ax / w) * (hy - my) + 1e-9;
}

/** Inverse picking against a map of elevations: tests candidate cells
 *  highest elevation first so a raised hex wins a tap on its face over the
 *  lower hex whose (occluded) top face sits behind it. */
export function isoPick(
  p: Vec2,
  elevationAt: (h: Axial) => number | undefined,
  maxElevation = HEX.maxElevation,
): Axial | undefined {
  for (let e = maxElevation; e >= 0; e--) {
    const h = isoToAxial(p, e);
    // Rounding is exact for the un-lifted hexagon, so a candidate at this
    // elevation is a hit iff the cell exists at exactly this elevation.
    if (elevationAt(h) === e) return h;
  }
  return undefined;
}
