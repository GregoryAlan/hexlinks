import { describe, expect, it } from 'vitest';
import { HEX, HEX_ART } from '../src/core/config';
import { makeRng } from '../src/core/rng';
import {
  axialToIso,
  flatToAxial,
  axialToFlat,
  hexDistance,
  hexKey,
  hexLine,
  hexRange,
  hexRound,
  inTopFace,
  isoCorners,
  isoPick,
  isoToAxial,
  neighbors,
  parseKey,
  type Axial,
} from '../src/hex/coords';
import { drawOrder, elevationAt, offsetToAxial, parseAsciiMap } from '../src/hex/map';
import { faceHeight, prismFaces, prismSilhouette } from '../src/hex/prism';
import { stairStepMap } from '../src/data/fixtures';

/** Property tests over the hex engine (PLAN.md §Verification): distance
 *  metric, line contiguity, project↔pick roundtrip including elevated
 *  cells, prism face heights, painter's order. Seeded — no Math.random. */

const rng = makeRng('hex-tests');
const randHex = (span = 12): Axial => ({ q: rng.int(-span, span), r: rng.int(-span, span) });

describe('hex coords', () => {
  it('distance is a metric and matches neighbours', () => {
    for (let i = 0; i < 300; i++) {
      const a = randHex();
      const b = randHex();
      const c = randHex();
      expect(hexDistance(a, a)).toBe(0);
      expect(hexDistance(a, b)).toBe(hexDistance(b, a));
      expect(hexDistance(a, c)).toBeLessThanOrEqual(hexDistance(a, b) + hexDistance(b, c));
      for (const n of neighbors(a)) expect(hexDistance(a, n)).toBe(1);
    }
  });

  it('hexLine is contiguous, inclusive, and distance+1 long', () => {
    for (let i = 0; i < 300; i++) {
      const a = randHex();
      const b = randHex();
      const line = hexLine(a, b);
      expect(line.length).toBe(hexDistance(a, b) + 1);
      expect(line[0]).toEqual(a);
      expect(line[line.length - 1]).toEqual(b);
      for (let k = 1; k < line.length; k++) expect(hexDistance(line[k - 1], line[k])).toBe(1);
    }
  });

  it('hexRange has 3r²+3r+1 cells all within r', () => {
    for (const r of [0, 1, 2, 5]) {
      const c = randHex();
      const cells = hexRange(c, r);
      expect(cells.length).toBe(3 * r * r + 3 * r + 1);
      for (const h of cells) expect(hexDistance(c, h)).toBeLessThanOrEqual(r);
      expect(new Set(cells.map(hexKey)).size).toBe(cells.length);
    }
  });

  it('key roundtrips', () => {
    for (let i = 0; i < 50; i++) {
      const h = randHex(1000);
      expect(parseKey(hexKey(h))).toEqual(h);
    }
  });

  it('hexRound is identity on integers and flat↔axial roundtrips', () => {
    for (let i = 0; i < 300; i++) {
      const h = randHex(50);
      expect(hexRound(h.q, h.r)).toEqual(h);
      expect(flatToAxial(axialToFlat(h))).toEqual(h);
    }
  });

  it('any point inside a top face rounds back to that cell (flat projection)', () => {
    const c = isoCorners();
    const hw = c[1].x;
    const hy = c[3].y;
    for (let i = 0; i < 500; i++) {
      const h = randHex(20);
      const center = axialToIso(h, 0);
      // rejection-sample a point inside the hexagon (iso space)
      let local = { x: 0, y: 0 };
      do {
        local = { x: rng.range(-hw, hw), y: rng.range(-hy, hy) };
      } while (!inTopFace(local));
      expect(isoToAxial({ x: center.x + local.x, y: center.y + local.y }, 0)).toEqual(h);
    }
  });
});

describe('iso pick', () => {
  const map = stairStepMap();
  const elev = (h: Axial) => elevationAt(map, h);

  it('every cell center picks itself unless a raised cell in front covers it', () => {
    let covered = 0;
    for (const cell of map.cells.values()) {
      const p = axialToIso(cell.coord, cell.elevation);
      const picked = isoPick(p, elev)!;
      if (picked.q === cell.coord.q && picked.r === cell.coord.r) continue;
      covered++;
      // Only a cell in FRONT (greater r) and HIGHER can cover this center,
      // and its top face must genuinely contain the point.
      expect(picked.r).toBeGreaterThan(cell.coord.r);
      expect(elev(picked)!).toBeGreaterThan(cell.elevation);
      const c = axialToIso(picked, elev(picked)!);
      expect(inTopFace({ x: p.x - c.x, y: p.y - c.y })).toBe(true);
    }
    // The fixture's raised green/plateau covers a few row-0/1 centers.
    expect(covered).toBeGreaterThan(0);
    expect(covered).toBeLessThan(map.cells.size / 4);
  });

  it('random points on top faces pick their own cell (raised cells win)', () => {
    const c = isoCorners();
    const hw = c[1].x;
    const hy = c[3].y;
    const order = drawOrder(map);
    for (let i = 0; i < 800; i++) {
      const cell = rng.pick(order);
      const center = axialToIso(cell.coord, cell.elevation);
      let local = { x: 0, y: 0 };
      do {
        local = { x: rng.range(-hw * 0.98, hw * 0.98), y: rng.range(-hy * 0.98, hy * 0.98) };
      } while (!inTopFace(local));
      const p = { x: center.x + local.x, y: center.y + local.y };
      const picked = isoPick(p, elev)!;
      expect(picked).toBeDefined();
      // Either this cell, or a HIGHER cell whose top face genuinely covers
      // the point (never a lower one — raised hexes win the tap).
      if (!(picked.q === cell.coord.q && picked.r === cell.coord.r)) {
        expect(elev(picked)!).toBeGreaterThan(cell.elevation);
      }
    }
  });

  it('returns undefined off the map', () => {
    expect(isoPick({ x: -5000, y: -5000 }, elev)).toBeUndefined();
  });
});

describe('prism faces', () => {
  const map = stairStepMap();

  it('face heights equal the drop to the neighbour under each visible edge', () => {
    for (const cell of map.cells.values()) {
      const f = prismFaces(map, cell);
      const sw = elevationAt(map, { q: cell.coord.q - 1, r: cell.coord.r + 1 });
      const se = elevationAt(map, { q: cell.coord.q, r: cell.coord.r + 1 });
      expect(f.swHeight).toBe(faceHeight(cell.elevation, sw));
      expect(f.seHeight).toBe(faceHeight(cell.elevation, se));
      if (sw !== undefined && sw >= cell.elevation) expect(f.sw).toBeUndefined();
      if (sw !== undefined && sw < cell.elevation) expect(f.swHeight).toBe((cell.elevation - sw) * HEX.elevPx);
      // Silhouette is a simple polygon whose bottom is the taller face.
      const sil = prismSilhouette(f);
      expect(Math.max(...sil.map((p) => p.y))).toBeCloseTo(f.bottomY, 6);
    }
  });

  it('a 4-level cliff shows a face 4 levels tall; a terrace step shows 1', () => {
    // Row 5 col 6 (R4) sits over row 6 col 6 (R0) to the SW and row 6 col 7
    // (O0) to the SE — a 4-level wall on both visible faces.
    const wall = map.cells.get(hexKey(offsetToAxial(6, 5)))!;
    expect(wall.terrain).toBe('rough');
    expect(wall.elevation).toBe(4);
    const fw = prismFaces(map, wall);
    expect(fw.swHeight).toBe(4 * HEX.elevPx);
    expect(fw.seHeight).toBe(4 * HEX.elevPx);
    // Row 2 col 6 (R4): SW is row 3 col 5 (F3) — one step; SE is row 3 col 6
    // (X4) — level, hidden.
    const step = map.cells.get(hexKey(offsetToAxial(6, 2)))!;
    const fs = prismFaces(map, step);
    expect(fs.swHeight).toBe(HEX.elevPx);
    expect(fs.seHeight).toBe(0);
    expect(fs.se).toBeUndefined();
    // Map edge: the lip.
    const edge = map.cells.get(hexKey(offsetToAxial(0, 8)))!;
    const fe = prismFaces(map, edge);
    expect(fe.swHeight).toBe(HEX_ART.edgeLipPx);
  });
});

describe('draw order', () => {
  it('is a permutation sorted back-to-front (r, then q) — every occluder draws after what it covers', () => {
    const map = stairStepMap();
    const order = drawOrder(map);
    expect(order.length).toBe(map.cells.size);
    expect(new Set(order.map((c) => hexKey(c.coord))).size).toBe(order.length);
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1].coord;
      const b = order[i].coord;
      expect(a.r < b.r || (a.r === b.r && a.q < b.q)).toBe(true);
    }
    // Geometric check: for any two cells whose prisms overlap on screen, the
    // one in front (greater r) is drawn later. Same-row prisms never overlap.
    const faces = order.map((c) => prismFaces(map, c));
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const A = faces[i];
        const B = faces[j];
        const overlap =
          A.top[4].x < B.top[1].x && B.top[4].x < A.top[1].x && A.top[0].y < B.bottomY && B.top[0].y < A.bottomY;
        if (order[i].coord.r === order[j].coord.r) {
          // same row: top faces may touch at an edge but never overlap
          expect(A.top[4].x < B.top[1].x - 1 && B.top[4].x < A.top[1].x - 1).toBe(false);
        } else if (overlap) {
          expect(order[j].coord.r).toBeGreaterThan(order[i].coord.r);
        }
      }
    }
  });
});

describe('ascii maps', () => {
  it('rejects bad tokens and off-map tee/pin', () => {
    expect(() => parseAsciiMap({ seed: 's', name: 'n', par: 3, rows: ['Z0'], tee: [0, 0], pin: [0, 0] })).toThrow();
    expect(() => parseAsciiMap({ seed: 's', name: 'n', par: 3, rows: ['F9'], tee: [0, 0], pin: [0, 0] })).toThrow();
    expect(() => parseAsciiMap({ seed: 's', name: 'n', par: 3, rows: ['F0'], tee: [1, 0], pin: [0, 0] })).toThrow();
  });
});
