import { describe, expect, it } from 'vitest';
import { MOVE, TERRAIN_MOVE_COST } from '../src/core/config';
import { stairStepMap } from '../src/data/fixtures';
import { tutorialMap } from '../src/data/tutorial';
import { hexDistance, hexKey, type Axial } from '../src/hex/coords';
import { cellAt, offsetToAxial, parseAsciiMap } from '../src/hex/map';
import { findPath, stepCost } from '../src/hex/path';
import { beginHole, clearHexes, stepParty } from '../src/state/run';

/** A* invariants incl. cliff and fog rules (PLAN.md §Verification). */

function assertWalkable(map: ReturnType<typeof stairStepMap>, path: Axial[]) {
  for (let i = 1; i < path.length; i++) {
    expect(hexDistance(path[i - 1], path[i])).toBe(1);
    const a = cellAt(map, path[i - 1])!;
    const b = cellAt(map, path[i])!;
    expect(Math.abs(a.elevation - b.elevation)).toBeLessThanOrEqual(MOVE.maxStepLevels);
    expect(Number.isFinite(TERRAIN_MOVE_COST[b.terrain])).toBe(true);
  }
}

describe('A* on the stair-step fixture', () => {
  const map = stairStepMap();

  it('reaches the pin from the tee up the terrace, never through a cliff', () => {
    const r = findPath(map, map.tee, map.pin);
    expect(r.path.length).toBeGreaterThan(1);
    expect(r.path[0]).toEqual(map.tee);
    expect(r.path[r.path.length - 1]).toEqual(map.pin);
    assertWalkable(map, r.path);
  });

  it('the 4-level wall is impassable directly: 0→4 needs the terrace', () => {
    const low = offsetToAxial(6, 6); // R0 at the foot of the wall
    const high = offsetToAxial(6, 5); // R4 directly above it
    expect(cellAt(map, low)!.elevation).toBe(0);
    expect(cellAt(map, high)!.elevation).toBe(4);
    expect(stepCost(cellAt(map, low)!, cellAt(map, high)!)).toBe(Infinity);
    const r = findPath(map, low, high);
    expect(r.path.length).toBeGreaterThan(2); // went around
    assertWalkable(map, r.path);
  });

  it('water and oob are never entered, and are unreachable goals', () => {
    const water = offsetToAxial(0, 5);
    expect(cellAt(map, water)!.terrain).toBe('water');
    expect(findPath(map, map.tee, water).path).toEqual([]);
    for (const cell of map.cells.values()) {
      const r = findPath(map, map.tee, cell.coord);
      for (const h of r.path) expect(['water', 'oob']).not.toContain(cellAt(map, h)!.terrain);
    }
  });

  it('climbing costs extra, descending is free, fog doubles', () => {
    const a = cellAt(map, offsetToAxial(1, 4))!; // F0
    const b = cellAt(map, offsetToAxial(2, 4))!; // F1
    expect(stepCost(a, b)).toBe(TERRAIN_MOVE_COST.fairway + MOVE.climbCostPerLevel);
    expect(stepCost(b, a)).toBe(TERRAIN_MOVE_COST.fairway);
    const cleared = new Set([hexKey(a.coord)]);
    expect(stepCost(a, b, cleared)).toBe((TERRAIN_MOVE_COST.fairway + MOVE.climbCostPerLevel) * MOVE.fogCostMult);
    expect(stepCost(b, a, cleared)).toBe(TERRAIN_MOVE_COST.fairway);
  });

  it('prefers a cleared corridor over a shorter fogged line', () => {
    // Straight corridor of fairway with a cleared detour: build a tiny map.
    const m = parseAsciiMap({
      seed: 't',
      name: 't',
      par: 3,
      rows: ['F0 F0 F0 F0 F0', 'F0 F0 F0 F0 F0', 'F0 F0 F0 F0 F0'],
      tee: [0, 1],
      pin: [4, 1],
    });
    const cleared = new Set<string>();
    for (let c = 0; c < 5; c++) cleared.add(hexKey(offsetToAxial(c, 0)));
    cleared.add(hexKey(m.tee));
    cleared.add(hexKey(m.pin));
    const fogged = findPath(m, m.tee, m.pin);
    const withFog = findPath(m, m.tee, m.pin, { cleared });
    expect(fogged.cost).toBe(4);
    // Detour along the cleared top row: at most one fogged step's worth more
    // than the straight line, but strictly cheaper than walking the fog.
    const straightInFog = 4 * MOVE.fogCostMult;
    expect(withFog.cost).toBeLessThan(straightInFog);
    for (const h of withFog.path.slice(1, -1)) expect(cleared.has(hexKey(h))).toBe(true);
  });

  it('is deterministic', () => {
    const a = findPath(map, map.tee, map.pin);
    const b = findPath(map, map.tee, map.pin);
    expect(a).toEqual(b);
  });
});

describe('tutorial hole', () => {
  const map = tutorialMap();

  it('tee is tee terrain, pin is on the green, both walkable from each other', () => {
    expect(cellAt(map, map.tee)!.terrain).toBe('tee');
    expect(cellAt(map, map.pin)!.terrain).toBe('green');
    const r = findPath(map, map.tee, map.pin);
    expect(r.path.length).toBeGreaterThan(5);
    assertWalkable(map, r.path);
  });

  it('every walkable cell is reachable from the tee (no islands)', () => {
    for (const cell of map.cells.values()) {
      if (!Number.isFinite(TERRAIN_MOVE_COST[cell.terrain])) continue;
      const r = findPath(map, map.tee, cell.coord);
      expect(r.path.length, `unreachable ${hexKey(cell.coord)} (${cell.terrain}${cell.elevation})`).toBeGreaterThan(0);
    }
  });

  it('elevations are within range and the green is raised above the tee', () => {
    for (const cell of map.cells.values()) {
      expect(cell.elevation).toBeGreaterThanOrEqual(0);
      expect(cell.elevation).toBeLessThanOrEqual(6);
    }
    expect(cellAt(map, map.pin)!.elevation).toBeGreaterThan(cellAt(map, map.tee)!.elevation);
  });
});

describe('run state reducers', () => {
  const map = tutorialMap();

  it('beginHole reveals a radius around the tee and nothing else', () => {
    const s = beginHole('seed', 0, map);
    expect(s.partyHex).toEqual(map.tee);
    expect(s.clearedHexes.has(hexKey(map.tee))).toBe(true);
    for (const k of s.clearedHexes) {
      const [q, r] = k.split(',').map(Number);
      expect(hexDistance({ q, r }, map.tee)).toBeLessThanOrEqual(MOVE.teeRevealRadius);
    }
    expect(s.clearedHexes.has(hexKey(map.pin))).toBe(false);
  });

  it('clearHexes and stepParty are pure', () => {
    const s0 = beginHole('seed', 0, map);
    const s1 = clearHexes(s0, [map.pin]);
    expect(s0.clearedHexes.has(hexKey(map.pin))).toBe(false);
    expect(s1.clearedHexes.has(hexKey(map.pin))).toBe(true);
    const s2 = stepParty(s1, map.pin);
    expect(s1.partyHex).toEqual(map.tee);
    expect(s2.partyHex).toEqual(map.pin);
    expect(s2.stepsTaken).toBe(1);
  });
});
