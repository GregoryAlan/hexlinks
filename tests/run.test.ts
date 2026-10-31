import { describe, expect, it } from 'vitest';
import { MOVE } from '../src/core/config';
import { makeRng } from '../src/core/rng';
import { tutorialMap } from '../src/data/tutorial';
import { hexDistance, hexKey } from '../src/hex/coords';
import { cellAt } from '../src/hex/map';
import { resolveShot } from '../src/shot/ballistics';
import { NO_SPIN, NO_WIND, toRecord } from '../src/shot/types';
import { applyShot, beginRun, clearHexes, shotSeed, stepParty } from '../src/state/run';

/** Pure-reducer tests for RunState. */
describe('run state reducers', () => {
  const map = tutorialMap();

  it('beginRun reveals a radius around the tee and claims only the tee', () => {
    const s = beginRun('seed', map);
    expect(s.partyHex).toEqual(map.tee);
    expect(s.clearedHexes.has(hexKey(map.tee))).toBe(true);
    for (const k of s.clearedHexes) {
      const [q, r] = k.split(',').map(Number);
      expect(hexDistance({ q, r }, map.tee)).toBeLessThanOrEqual(MOVE.teeRevealRadius);
    }
    expect(s.clearedHexes.has(hexKey(map.pin))).toBe(false);
    expect([...s.claimedHexes]).toEqual([hexKey(map.tee)]);
    expect(s.strokes).toBe(0);
  });

  it('clearHexes and stepParty are pure', () => {
    const s0 = beginRun('seed', map);
    const s1 = clearHexes(s0, [map.pin]);
    expect(s0.clearedHexes.has(hexKey(map.pin))).toBe(false);
    expect(s1.clearedHexes.has(hexKey(map.pin))).toBe(true);
    const s2 = stepParty(s1, map.pin);
    expect(s1.partyHex).toEqual(map.tee);
    expect(s2.partyHex).toEqual(map.pin);
    expect(s2.stepsTaken).toBe(1);
  });

  it('applyShot counts the stroke, moves the ball, clears and claims the corridor', () => {
    const s0 = beginRun('seed', map);
    const o = resolveShot(
      { from: s0.ballHex, target: map.pin, club: 'iron', shape: 'standard', spin: NO_SPIN, swing: { power: 1, accuracy: 0 }, wind: NO_WIND },
      map,
      makeRng(shotSeed(s0)),
    );
    const s1 = applyShot(s0, map, toRecord(o));
    expect(s0.strokes).toBe(0);
    expect(s1.strokes).toBe(1);
    expect(s1.strokesTotal).toBe(1);
    expect(s1.ballHex).toEqual(o.restHex);
    for (const h of o.clearedPath) {
      expect(s1.clearedHexes.has(hexKey(h))).toBe(true);
      expect(s1.claimedHexes.has(hexKey(h))).toBe(true);
    }
    for (const k of s1.claimedHexes) expect(s1.clearedHexes.has(k)).toBe(true);
    expect(shotSeed(s1)).not.toBe(shotSeed(s0));
  });

  it('a penalty adds a stroke and leaves the ball on a walkable hex', () => {
    const s0 = beginRun('seed', map);
    // Aim at the pond on the low left.
    const pond = [...map.cells.values()].find((c) => c.terrain === 'water')!.coord;
    const o = resolveShot(
      { from: s0.ballHex, target: pond, club: 'driver', shape: 'standard', spin: NO_SPIN, swing: { power: 0.5, accuracy: 0 }, wind: NO_WIND },
      map,
      null,
    );
    const s1 = applyShot(s0, map, toRecord(o));
    const t = cellAt(map, s1.ballHex)!.terrain;
    expect(['water', 'oob']).not.toContain(t);
    if (o.terminal === 'water' || o.terminal === 'oob') expect(s1.strokes).toBe(2);
  });
});
