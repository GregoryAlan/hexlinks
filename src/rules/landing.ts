import { TERRAIN_MOVE_COST } from '../core/config';
import type { Axial } from '../hex/coords';
import { cellAt, type HoleMap } from '../hex/map';
import type { ShotRecord } from '../shot/types';

/** Landing rules (PLAN v2 §MICRO): where the ball lies after a shot and
 *  what it costs. Pure. Water → drop on the last dry, walkable hex the ball
 *  passed over (+1); off the map / out of bounds → replay from the previous
 *  lie (+1); anything else → it lies where it stopped. */
export interface Landing {
  ballHex: Axial;
  penalty: number;
  note: 'drop' | 'replay' | null;
}

export function resolveLanding(map: HoleMap, prev: Axial, rec: ShotRecord): Landing {
  if (rec.terminal === 'oob') return { ballHex: { ...prev }, penalty: 1, note: 'replay' };
  if (rec.terminal === 'water') {
    for (let i = rec.path.length - 1; i >= 0; i--) {
      const cell = cellAt(map, rec.path[i]);
      if (cell && Number.isFinite(TERRAIN_MOVE_COST[cell.terrain])) return { ballHex: { ...cell.coord }, penalty: 1, note: 'drop' };
    }
    return { ballHex: { ...prev }, penalty: 1, note: 'drop' };
  }
  return { ballHex: { ...rec.restHex }, penalty: 0, note: null };
}
