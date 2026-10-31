import { BALLISTICS, HEX, LIE, ROLL_MULT, SHAPES, SPIN } from '../core/config';
import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/types';
import { clubDef, isGroundShot } from '../data/clubs';
import { axialToFlat, flatToAxial, HEX_DIRS, hexEq, hexKey, hexRange, type Axial } from '../hex/coords';
import { cellAt, type HexCell, type HoleMap, type TerrainKind } from '../hex/map';
import type { ClubDef, FlightSample, ShotEvent, ShotInput, ShotOutcome, ShotShape, ShotTerminal, Spin, SwingResult } from './types';

/** Pure 2.5D shot model (PLAN v2 §MICRO). Units: hexes along the ground
 *  (centre to centre), elevation levels up — the heightfield's own units, so
 *  every terrain check is a comparison. The arc is a parabola from the
 *  launch elevation that keeps flying past the intended carry until it meets
 *  ground, which makes downhill shots run long and uphill shots land short
 *  with no fudge constants. Deterministic given the rng; `rng = null` gives
 *  the mean path for previews. No trig, no physics engine. */

const SQRT3 = Math.sqrt(3);
/** Flat px between adjacent hex centres. */
export const HEX_W = HEX.size * SQRT3;

/** Straight-line distance between hex centres in hex widths — the unit
 *  carry is measured in. (`hexDistance` is a step metric and runs ~15% long
 *  on vertical lines, so it is not used for ranges.) */
export function distHexes(a: Axial, b: Axial): number {
  const fa = axialToFlat(a);
  const fb = axialToFlat(b);
  return Math.hypot(fb.x - fa.x, fb.y - fa.y) / HEX_W;
}

export function lieOf(map: HoleMap, h: Axial): TerrainKind {
  return cellAt(map, h)?.terrain ?? 'oob';
}

/** Unit flat-world direction from one hex centre to another (default: up
 *  the screen when they coincide). */
export function flatDir(from: Axial, target: Axial): Vec2 {
  const a = axialToFlat(from);
  const b = axialToFlat(target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: 0, y: -1 };
  return { x: dx / len, y: dy / len };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Full-power carry for this club/shape/lie, in hexes. */
export function fullCarry(club: ClubDef, shape: ShotShape, lie: TerrainKind): number {
  return club.maxCarry * SHAPES[shape].range * LIE[lie].carry;
}

export function carryHexes(club: ClubDef, shape: ShotShape, swing: SwingResult, lie: TerrainKind): number {
  return fullCarry(club, shape, lie) * clamp01(swing.power);
}

/** Power fraction that carries `dist` hexes (clamped to the club's reach). */
export function powerFor(dist: number, club: ClubDef, shape: ShotShape, lie: TerrainKind): number {
  const full = fullCarry(club, shape, lie);
  return full > 0 ? clamp01(dist / full) : 0;
}

export function apexLevels(club: ClubDef, shape: ShotShape, power: number): number {
  return club.loft * SHAPES[shape].apex * (BALLISTICS.apexFloor + (1 - BALLISTICS.apexFloor) * clamp01(power));
}

/** Lateral miss in hexes at a full-width accuracy error — the aim ring. */
export function dispersionHexes(club: ClubDef, shape: ShotShape, spin: Spin, lie: TerrainKind): number {
  return club.dispersion * SHAPES[shape].disp * LIE[lie].disp * (spin.curve !== 0 ? 1 / SPIN.curveSweetMult : 1);
}

/** The three hex directions that point most along `dir`, best first. */
export function forwardDirs(dir: Vec2): Axial[] {
  const scored = HEX_DIRS.map((d) => {
    const f = axialToFlat(d);
    const len = Math.hypot(f.x, f.y);
    return { d, dot: (f.x * dir.x + f.y * dir.y) / len };
  });
  scored.sort((a, b) => b.dot - a.dot);
  return scored.slice(0, 3).map((s) => s.d);
}

interface Ctx {
  map: HoleMap;
  club: ClubDef;
  input: ShotInput;
  lie: TerrainKind;
  dir: Vec2;
  perp: Vec2;
  fromFlat: Vec2;
  power: number;
  carry: number;
  lateralEnd: number;
  curveEnd: number;
  events: ShotEvent[];
}

export function resolveShot(input: ShotInput, map: HoleMap, rng: Rng | null): ShotOutcome {
  const club = clubDef(input.club);
  const lie = lieOf(map, input.from);
  const fromCell = cellAt(map, input.from);
  const dir = flatDir(input.from, input.target);
  const perp = { x: -dir.y, y: dir.x };
  const power = clamp01(input.swing.power);
  const noise = LIE[lie].noise;
  const noiseL = rng ? rng.range(-1, 1) * noise : 0;
  const noiseC = rng ? rng.range(-1, 1) * noise * 0.5 : 0;
  const acc = Math.max(-1, Math.min(1, input.swing.accuracy));
  const carry = Math.max(0, carryHexes(club, input.shape, input.swing, lie) + noiseC);
  const ctx: Ctx = {
    map,
    club,
    input,
    lie,
    dir,
    perp,
    fromFlat: axialToFlat(input.from),
    power,
    carry,
    lateralEnd: acc * dispersionHexes(club, input.shape, input.spin, lie) + noiseL,
    // Shaped shots bend in proportion to how far they fly.
    curveEnd: input.spin.curve * SPIN.curveHexes * (club.maxCarry > 0 ? carry / club.maxCarry : 0),
    events: [],
  };
  if (!fromCell || carry < 0.05) return stationary(input.from, map);
  if (isGroundShot(input.club, input.shape)) return groundShot(ctx, fromCell);
  return flightShot(ctx, fromCell, rng);
}

/** Mean-path preview: perfect swing, no lie noise, no canopy luck. */
export function predictShot(input: ShotInput, map: HoleMap): ShotOutcome {
  return resolveShot({ ...input, swing: { ...input.swing, accuracy: 0 } }, map, null);
}

function stationary(h: Axial, map: HoleMap): ShotOutcome {
  return finish(map, h, h, [], [h], [], []);
}

// ---- flight ------------------------------------------------------------------

function flightShot(c: Ctx, fromCell: HexCell, rng: Rng | null): ShotOutcome {
  const apex = apexLevels(c.club, c.input.shape, c.power);
  const elev0 = fromCell.elevation;
  const stepHex = 1 / BALLISTICS.samplesPerHex;
  const samples: FlightSample[] = [];
  const path: Axial[] = [c.input.from];
  let curHex = c.input.from;
  let prevDistinct = c.input.from;
  let enteredAbove = true;
  let lastTreeChecked: string | null = null;
  let landing: Axial | null = null;
  let rest: Axial | null = null;
  const maxI = Math.ceil((c.carry * 3 + 4) * BALLISTICS.samplesPerHex);

  for (let i = 1; i <= maxI; i++) {
    const d = i * stepHex;
    const s = d / c.carry;
    const side = (c.lateralEnd * s + c.curveEnd * s * s) * HEX_W;
    const drift = apex * s * HEX_W;
    const x = c.fromFlat.x + c.dir.x * d * HEX_W + c.perp.x * side + c.input.wind.dx * drift;
    const y = c.fromFlat.y + c.dir.y * d * HEX_W + c.perp.y * side + c.input.wind.dy * drift;
    const h = elev0 + 4 * apex * s * (1 - s);
    const hex = flatToAxial({ x, y });
    const cell = cellAt(c.map, hex);
    if (!cell) {
      // Flew off the map edge: the ball is gone; rules replay from the last hex.
      c.events.push('oob');
      return finish(c.map, prevOrCur(path), prevOrCur(path), samples, path, [], c.events, 'oob');
    }
    if (!hexEq(hex, curHex)) {
      prevDistinct = curHex;
      curHex = hex;
      path.push(hex);
      enteredAbove = h >= cell.elevation;
    }
    samples.push({ x, y, h, hex });
    if (s < BALLISTICS.minStrikeS) continue;

    if (h <= cell.elevation + 1e-9) {
      if (enteredAbove && s > 0.5) {
        landing = hex;
        break;
      }
      // Ascending into a face, or came in under a cell top: ridge strike —
      // the ball drops back onto the previous hex.
      c.events.push('ridgeStrike');
      path.pop();
      rest = prevDistinct;
      landing = rest;
      break;
    }
    if (cell.terrain === 'trees') {
      const k = hexKey(hex);
      if (k !== lastTreeChecked) {
        lastTreeChecked = k;
        const above = h - cell.elevation;
        if (above >= BALLISTICS.trunkLevels && above < BALLISTICS.canopyLevels) {
          const chance = SHAPES[c.input.shape].canopyStrike;
          if (rng && chance > 0 && rng.float() < chance) {
            c.events.push('canopyStrike');
            landing = hex;
            rest = hex;
            break;
          }
        }
      }
    }
  }
  if (!landing) {
    // Never met ground within the guard (should not happen on a closed map).
    landing = curHex;
    rest = curHex;
  }
  if (rest) return finish(c.map, landing, rest, samples, path, [], c.events);
  const roll = rollOut(c, landing, c.input.spin);
  return finish(c.map, landing, roll.rest, samples, path.concat(roll.path), roll.path, c.events);
}

function prevOrCur(path: Axial[]): Axial {
  return path[path.length - 1];
}

// ---- roll --------------------------------------------------------------------

function rollOut(c: Ctx, landing: Axial, spin: Spin): { rest: Axial; path: Axial[] } {
  const landCell = cellAt(c.map, landing)!;
  const mult = ROLL_MULT[landCell.terrain];
  let n = Math.round(c.club.rollFactor * SHAPES[c.input.shape].roll * (1 + spin.roll * SPIN.rollDelta) * c.power * mult);
  n = Math.min(n, BALLISTICS.maxRoll);
  const dirs = forwardDirs(c.dir);
  const path: Axial[] = [];
  const origin = axialToFlat(landing);
  // Lateral offset of a hex from the roll line — ties in elevation break
  // toward the line so a straight roll stays straight.
  const off = (h: Axial) => {
    const f = axialToFlat(h);
    return Math.abs((f.x - origin.x) * c.perp.x + (f.y - origin.y) * c.perp.y);
  };
  let cur = landing;
  let curCell = landCell;
  let steps = 0;
  while (n > 0 && steps < BALLISTICS.maxRoll) {
    let best: HexCell | null = null;
    for (const d of dirs) {
      const cell = cellAt(c.map, { q: cur.q + d.q, r: cur.r + d.r });
      if (!cell) continue;
      if (!best || cell.elevation < best.elevation || (cell.elevation === best.elevation && off(cell.coord) < off(best.coord))) best = cell;
    }
    if (!best) break;
    if (best.elevation > curCell.elevation) {
      c.events.push('rollStopUphill');
      break;
    }
    if (best.elevation < curCell.elevation) n += 1; // gravity feeds the run
    cur = best.coord;
    curCell = best;
    path.push(cur);
    n--;
    steps++;
    if (best.terrain === 'water' || best.terrain === 'oob' || ROLL_MULT[best.terrain] === 0) break;
  }
  return { rest: cur, path };
}

// ---- ground shots (putter, bump-and-run) --------------------------------------

function groundShot(c: Ctx, fromCell: HexCell): ShotOutcome {
  const n = Math.max(1, Math.round(c.carry));
  const end = {
    x: c.fromFlat.x + c.dir.x * n * HEX_W + c.perp.x * c.lateralEnd * HEX_W,
    y: c.fromFlat.y + c.dir.y * n * HEX_W + c.perp.y * c.lateralEnd * HEX_W,
  };
  // Sample the straight flat line so diagonals stay contiguous.
  const steps = Math.ceil(n * BALLISTICS.samplesPerHex) + 1;
  const line: Axial[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const h = flatToAxial({ x: c.fromFlat.x + (end.x - c.fromFlat.x) * t, y: c.fromFlat.y + (end.y - c.fromFlat.y) * t });
    if (line.length === 0 ? !hexEq(h, c.input.from) : !hexEq(h, line[line.length - 1])) line.push(h);
  }
  const path: Axial[] = [c.input.from];
  let budget = n;
  let cur = c.input.from;
  let curCell = fromCell;
  for (const next of line) {
    const cell = cellAt(c.map, next);
    if (!cell) {
      c.events.push('oob');
      return finish(c.map, c.input.from, cur, [], path, path.slice(1), c.events, 'oob');
    }
    const delta = cell.elevation - curCell.elevation;
    if (delta > BALLISTICS.groundMaxClimb) {
      c.events.push('rollStopUphill');
      break;
    }
    const cost = 1 + Math.max(0, delta) * BALLISTICS.groundClimbCost - (delta < 0 ? 1 : 0);
    if (budget - cost < 0) break;
    budget -= cost;
    cur = next;
    curCell = cell;
    path.push(next);
    if (hexEq(next, c.map.pin)) break;
    if (cell.terrain === 'water' || cell.terrain === 'oob' || ROLL_MULT[cell.terrain] === 0) break;
  }
  return finish(c.map, c.input.from, cur, [], path, path.slice(1), c.events);
}

// ---- outcome -----------------------------------------------------------------

function finish(
  map: HoleMap,
  landing: Axial,
  rest: Axial,
  samples: FlightSample[],
  path: Axial[],
  rollPath: Axial[],
  events: ShotEvent[],
  forced?: ShotTerminal,
): ShotOutcome {
  const restCell = cellAt(map, rest);
  let terminal: ShotTerminal = forced ?? 'rest';
  if (!forced) {
    if (!restCell || restCell.terrain === 'oob') terminal = 'oob';
    else if (restCell.terrain === 'water') terminal = 'water';
    else if (hexEq(rest, map.pin)) terminal = 'holed';
  }
  if (terminal === 'water' && !events.includes('splash')) events.push('splash');
  if (terminal === 'holed') events.push('holed');
  if (terminal === 'oob' && !events.includes('oob')) events.push('oob');
  const seen = new Set<string>();
  const cleared: Axial[] = [];
  const add = (h: Axial) => {
    const k = hexKey(h);
    if (seen.has(k) || !cellAt(map, h)) return;
    seen.add(k);
    cleared.push(h);
  };
  const core = [...path, ...rollPath, landing, rest];
  for (const h of core) add(h);
  for (const h of core) for (const w of hexRange(h, BALLISTICS.clearRadius)) add(w);
  return { landingHex: landing, restHex: rest, flightSamples: samples, path: dedupe(path), rollPath, clearedPath: cleared, events, terminal };
}

function dedupe(hs: Axial[]): Axial[] {
  const out: Axial[] = [];
  for (const h of hs) if (out.length === 0 || !hexEq(out[out.length - 1], h)) out.push(h);
  return out;
}
