import { describe, expect, it } from 'vitest';
import { BALLISTICS, CLUBS, SHAPES } from '../src/core/config';
import { makeRng, type Rng } from '../src/core/rng';
import { clubDef } from '../src/data/clubs';
import { tutorialMap } from '../src/data/tutorial';
import { hexDistance, hexEq, hexKey, type Axial } from '../src/hex/coords';
import { cellAt, offsetToAxial, parseAsciiMap, type HoleMap } from '../src/hex/map';
import { apexLevels, dispersionHexes, distHexes, powerFor, predictShot, resolveShot } from '../src/shot/ballistics';
import { NO_SPIN, NO_WIND, toRecord, type ClubId, type ShotInput, type ShotShape, type Spin } from '../src/shot/types';

/** Ballistics goldens + invariants (PLAN v2 §Verification). Maps are built
 *  from glyph rows: a 9-wide column of fairway with the tee at the bottom,
 *  optional feature rows splashed in by row index. */

function column(rows: number, over: Record<number, string> = {}, cols = 9): HoleMap {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) lines.push(over[r] ?? Array(cols).fill('F0').join(' '));
  return parseAsciiMap({ seed: 't', name: 't', par: 4, rows: lines, tee: [4, rows - 1], pin: [4, 0] });
}

function shot(map: HoleMap, club: ClubId, power = 1, opts: Partial<ShotInput> = {}): ShotInput {
  return {
    from: map.tee,
    target: map.pin,
    club,
    shape: 'standard',
    spin: NO_SPIN,
    swing: { power, accuracy: 0 },
    wind: NO_WIND,
    ...opts,
  };
}

const fixed = (v: number): Rng => ({ float: () => v, int: () => 0, range: () => 0, oneIn: () => false, pick: (a) => a[0] });

describe('flight on flat ground', () => {
  const map = column(30);

  it('full-power driver carries its max and rolls out', () => {
    const o = predictShot(shot(map, 'driver'), map);
    expect(o.terminal).toBe('rest');
    expect(Math.abs(distHexes(map.tee, o.landingHex) - CLUBS.driver.maxCarry)).toBeLessThanOrEqual(0.6);
    expect(o.rollPath.length).toBe(CLUBS.driver.rollFactor);
    expect(distHexes(map.tee, o.restHex)).toBeGreaterThan(distHexes(map.tee, o.landingHex));
  });

  it('carry scales with power; powerFor inverts it', () => {
    const half = predictShot(shot(map, 'driver', 0.5), map);
    expect(Math.abs(distHexes(map.tee, half.landingHex) - 6)).toBeLessThanOrEqual(0.6);
    const p = powerFor(6, clubDef('driver'), 'standard', 'fairway');
    expect(p).toBeCloseTo(0.5);
  });

  it('each club at full power lands near its max carry (golden table)', () => {
    const table: Record<string, number> = {};
    for (const id of Object.keys(CLUBS) as ClubId[]) {
      if (CLUBS[id].loft === 0) continue;
      const o = predictShot(shot(map, id), map);
      table[id] = Math.round(distHexes(map.tee, o.landingHex) * 10) / 10;
      expect(Math.abs(table[id] - CLUBS[id].maxCarry)).toBeLessThanOrEqual(0.6);
    }
    expect(table).toMatchSnapshot();
  });

  it('accuracy error pushes the ball sideways by the dispersion', () => {
    const straight = predictShot(shot(map, 'iron'), map);
    const pushed = resolveShot(shot(map, 'iron', 1, { swing: { power: 1, accuracy: 1 } }), map, null);
    expect(hexEq(straight.landingHex, pushed.landingHex)).toBe(false);
    const d = hexDistance(straight.landingHex, pushed.landingHex);
    expect(Math.abs(d - Math.round(dispersionHexes(clubDef('iron'), 'standard', NO_SPIN, 'fairway')))).toBeLessThanOrEqual(1);
  });

  it('draw and fade bend opposite ways', () => {
    const draw: Spin = { roll: 0, curve: -1 };
    const fade: Spin = { roll: 0, curve: 1 };
    const a = predictShot(shot(map, 'driver', 1, { spin: draw }), map);
    const b = predictShot(shot(map, 'driver', 1, { spin: fade }), map);
    expect(a.landingHex.q).not.toBe(b.landingHex.q);
  });

  it('top spin rolls further than back spin', () => {
    const top = predictShot(shot(map, 'driver', 1, { spin: { roll: 1, curve: 0 } }), map);
    const back = predictShot(shot(map, 'driver', 1, { spin: { roll: -1, curve: 0 } }), map);
    expect(top.rollPath.length).toBeGreaterThan(back.rollPath.length);
  });
});

describe('elevation', () => {
  it('uphill lands short, downhill runs long', () => {
    const up = column(30, Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i, Array(9).fill('F2').join(' ')])));
    const flat = column(30);
    const down = parseAsciiMap({
      seed: 'd',
      name: 'd',
      par: 4,
      rows: Array.from({ length: 30 }, (_, r) => Array(9).fill(r >= 25 ? 'F2' : 'F0').join(' ')),
      tee: [4, 29],
      pin: [4, 0],
    });
    const dUp = distHexes(up.tee, predictShot(shot(up, 'iron'), up).landingHex);
    const dFlat = distHexes(flat.tee, predictShot(shot(flat, 'iron'), flat).landingHex);
    const dDown = distHexes(down.tee, predictShot(shot(down, 'iron'), down).landingHex);
    expect(dUp).toBeLessThan(dFlat - 1);
    expect(dDown).toBeGreaterThan(dFlat + 0.5);
  });

  it('a wall blocks low-loft lines; a flop clears it', () => {
    // Wall of rough at elevation 5, four rows above the tee; flat beyond.
    const wallRow = 29 - 4;
    const map = column(30, { [wallRow]: Array(9).fill('R5').join(' ') });
    const wall = offsetToAxial(4, wallRow);
    for (const [club, shape] of [
      ['driver', 'standard'],
      ['iron', 'standard'],
      ['wedge', 'standard'],
    ] as Array<[ClubId, ShotShape]>) {
      const o = predictShot(shot(map, club, 1, { shape }), map);
      expect(o.events, `${club}/${shape}`).toContain('ridgeStrike');
      expect(hexDistance(map.tee, o.restHex)).toBeLessThan(hexDistance(map.tee, wall));
    }
    const flop = predictShot(shot(map, 'wedge', 1, { shape: 'flop', target: offsetToAxial(4, wallRow - 3) }), map);
    expect(flop.events).not.toContain('ridgeStrike');
    expect(apexLevels(clubDef('wedge'), 'flop', 1)).toBeGreaterThan(5);
  });

  it('roll follows the downhill gradient and stops at a rise', () => {
    // Land on a 2-level terrace that steps down toward the pin, then rises.
    const rows: Record<number, string> = {};
    for (let r = 0; r < 30; r++) {
      const e = r >= 20 ? 2 : r >= 18 ? 1 : r >= 12 ? 0 : 3;
      rows[r] = Array(9).fill(`F${e}`).join(' ');
    }
    rows[29] = Array(9).fill('F2').join(' ');
    const map = column(30, rows);
    const o = predictShot(shot(map, 'driver', 0.65), map); // ~7.8 hex widths ≈ 9 rows: the F2 shelf
    expect(cellAt(map, o.landingHex)!.elevation).toBeLessThanOrEqual(2);
    expect(o.rollPath.length).toBeGreaterThan(0);
    const elevs = [o.landingHex, ...o.rollPath].map((h) => cellAt(map, h)!.elevation);
    for (let i = 1; i < elevs.length; i++) expect(elevs[i]).toBeLessThanOrEqual(elevs[i - 1]);
  });
});

describe('trees', () => {
  const treeRow = 29 - 2;
  const map = column(30, { [treeRow]: Array(9).fill('X0').join(' ') });

  it('a standard shot can be caught by the canopy; a punch gets under or past it', () => {
    const std = resolveShot(shot(map, 'iron'), map, fixed(0.3));
    expect(std.events).toContain('canopyStrike');
    expect(cellAt(map, std.restHex)!.terrain).toBe('trees');
    const punch = resolveShot(shot(map, 'driver', 1, { shape: 'punch' }), map, fixed(0.3));
    expect(punch.events).not.toContain('canopyStrike');
    expect(SHAPES.punch.canopyStrike).toBeLessThan(0.3);
  });

  it('previews never gamble on the canopy', () => {
    const o = predictShot(shot(map, 'iron'), map);
    expect(o.events).not.toContain('canopyStrike');
  });
});

describe('water, edges and the cup', () => {
  it('landing in water is terminal water with a splash', () => {
    const water = Array(9).fill('W0').join(' ');
    const map = column(30, { 19: water, 20: water, 21: water, 22: water });
    const o = predictShot(shot(map, 'driver', 0.65), map);
    expect(o.terminal).toBe('water');
    expect(o.events).toContain('splash');
  });

  it('flying off the map is out of bounds', () => {
    const map = column(8);
    const o = predictShot(shot(map, 'driver'), map);
    expect(o.terminal).toBe('oob');
  });

  it('a putt that rolls over the pin hex holes out', () => {
    const map = column(12, Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i, Array(9).fill('G0').join(' ')])));
    const from = offsetToAxial(4, 3);
    const o = predictShot(shot(map, 'putter', 1, { from }), map);
    expect(o.terminal).toBe('holed');
    expect(hexEq(o.restHex, map.pin)).toBe(true);
  });

  it('a putt rolls its carry on the flat and climbs at most one level', () => {
    const rows: Record<number, string> = {};
    for (let r = 0; r < 12; r++) rows[r] = Array(9).fill(r <= 4 ? 'G2' : 'G0').join(' ');
    const map = column(12, rows);
    const o = predictShot(shot(map, 'putter', 1, { from: offsetToAxial(4, 11) }), map);
    expect(o.terminal).toBe('rest');
    expect(hexDistance(map.tee, o.restHex)).toBe(CLUBS.putter.maxCarry);
    const up = predictShot(shot(map, 'putter', 1, { from: offsetToAxial(4, 6) }), map);
    expect(up.events).toContain('rollStopUphill');
  });
});

describe('corridor and determinism', () => {
  const map = tutorialMap();

  function corridorChecks(o: ReturnType<typeof resolveShot>) {
    for (let i = 1; i < o.path.length; i++) expect(hexDistance(o.path[i - 1], o.path[i])).toBe(1);
    const keys = new Set(o.clearedPath.map(hexKey));
    expect(keys.has(hexKey(o.landingHex))).toBe(true);
    expect(keys.has(hexKey(o.restHex))).toBe(true);
    for (const h of o.clearedPath) expect(cellAt(map, h)).toBeDefined();
    for (const h of o.path) expect(o.clearedPath.some((c) => hexDistance(c, h) <= BALLISTICS.clearRadius)).toBe(true);
  }

  it('the path is contiguous and the corridor covers it, on every line from the tee', () => {
    for (const cell of map.cells.values()) {
      if (hexEq(cell.coord, map.tee)) continue;
      for (const club of ['driver', 'wedge', 'putter'] as ClubId[]) {
        const o = resolveShot(shot(map, club, 1, { target: cell.coord }), map, null);
        corridorChecks(o);
      }
    }
  });

  it('same seed → same outcome; records snapshot (golden)', () => {
    const inputs: ShotInput[] = [
      shot(map, 'driver'),
      shot(map, 'iron', 0.8, { from: offsetToAxial(5, 12), spin: { roll: -1, curve: 1 } }),
      shot(map, 'wedge', 1, { from: offsetToAxial(3, 5), shape: 'flop' }),
      shot(map, 'putter', 0.6, { from: offsetToAxial(4, 3) }),
    ];
    const records = inputs.map((inp, i) => toRecord(resolveShot(inp, map, makeRng(`golden:${i}`))));
    const again = inputs.map((inp, i) => toRecord(resolveShot(inp, map, makeRng(`golden:${i}`))));
    expect(again).toEqual(records);
    expect(records.map((r) => ({ ...r, path: r.path.map(hexKey), clearedPath: r.clearedPath.length }))).toMatchSnapshot();
  });

  it('seed sweep: every shot ends on the map or in a terminal, never NaN', () => {
    const rng = makeRng('sweep');
    const cells = [...map.cells.values()].map((c) => c.coord);
    const ids = Object.keys(CLUBS) as ClubId[];
    for (let i = 0; i < 300; i++) {
      const from = rng.pick(cells);
      const fc = cellAt(map, from)!;
      if (fc.terrain === 'water' || fc.terrain === 'oob') continue;
      const inp = shot(map, rng.pick(ids), rng.float(), {
        from,
        target: rng.pick(cells),
        swing: { power: rng.float(), accuracy: rng.range(-1, 1) },
        spin: { roll: rng.pick([-1, 0, 1]), curve: rng.pick([-1, 0, 1]) } as Spin,
        wind: { dx: rng.range(-0.25, 0.25), dy: rng.range(-0.25, 0.25) },
      });
      const o = resolveShot(inp, map, makeRng(`sweep:${i}`));
      expect(Number.isFinite(o.restHex.q) && Number.isFinite(o.restHex.r)).toBe(true);
      if (o.terminal !== 'oob') expect(cellAt(map, o.restHex)).toBeDefined();
      const isTerminalFor = (h: Axial) => {
        const c = cellAt(map, h);
        return !c || c.terrain === 'oob' ? 'oob' : c.terrain === 'water' ? 'water' : hexEq(h, map.pin) ? 'holed' : 'rest';
      };
      if (o.terminal !== 'oob') expect(o.terminal).toBe(isTerminalFor(o.restHex));
    }
  });
});
