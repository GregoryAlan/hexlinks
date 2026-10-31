import { describe, expect, it } from 'vitest';
import { offsetToAxial, parseAsciiMap } from '../src/hex/map';
import { resolveLanding } from '../src/rules/landing';
import type { ShotRecord } from '../src/shot/types';

const map = parseAsciiMap({
  seed: 'l',
  name: 'l',
  par: 3,
  rows: ['G0 G0 G0', 'W0 W0 W0', 'F0 F0 F0', 'S0 F0 F0', 'T0 F0 F0'],
  tee: [0, 4],
  pin: [1, 0],
});

function rec(path: [number, number][], terminal: ShotRecord['terminal']): ShotRecord {
  const p = path.map(([c, r]) => offsetToAxial(c, r));
  return { landingHex: p[p.length - 1], restHex: p[p.length - 1], path: p, clearedPath: p, terminal, events: [] };
}

describe('landing rules', () => {
  it('water drops on the last dry walkable hex of the path with a one-stroke penalty', () => {
    const l = resolveLanding(map, map.tee, rec([[0, 4], [0, 3], [1, 2], [1, 1]], 'water'));
    expect(l.ballHex).toEqual(offsetToAxial(1, 2));
    expect(l.penalty).toBe(1);
    expect(l.note).toBe('drop');
  });

  it('water with no dry hex behind drops back on the previous lie', () => {
    const l = resolveLanding(map, offsetToAxial(1, 2), rec([[1, 1]], 'water'));
    expect(l.ballHex).toEqual(offsetToAxial(1, 2));
    expect(l.penalty).toBe(1);
  });

  it('out of bounds replays from the previous lie', () => {
    const l = resolveLanding(map, map.tee, rec([[0, 4], [1, 3]], 'oob'));
    expect(l.ballHex).toEqual(map.tee);
    expect(l.penalty).toBe(1);
    expect(l.note).toBe('replay');
  });

  it('rest and holed lie where the ball stopped, no penalty', () => {
    expect(resolveLanding(map, map.tee, rec([[0, 4], [1, 3]], 'rest')).penalty).toBe(0);
    expect(resolveLanding(map, map.tee, rec([[0, 4], [1, 0]], 'holed')).ballHex).toEqual(map.pin);
  });
});
