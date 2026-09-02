import { MOVE, TERRAIN_MOVE_COST } from '../core/config';
import { hexDistance, hexKey, neighbors, type Axial, type HexKey } from './coords';
import { cellAt, type HexCell, type HoleMap } from './map';

/** Textbook A* over the hex map. Cost model (PLAN.md §Hex engine, §Cursed
 *  fog): per hex ENTERED, `TERRAIN_MOVE_COST[terrain]` + climb cost per
 *  level ascended, all ×MOVE.fogCostMult when the hex is not cleared; steps
 *  of more than MOVE.maxStepLevels are cliffs (unwalkable either way).
 *  Water/oob are ∞. Deterministic: ties break on insertion order. */

export interface PathOptions {
  cleared?: ReadonlySet<HexKey>;
  /** Cap on expanded nodes — a guard for the generation gate. */
  maxExpansions?: number;
}

/** Cost of stepping from `from` into `to`, or Infinity if illegal. */
export function stepCost(from: HexCell, to: HexCell, cleared?: ReadonlySet<HexKey>): number {
  const base = TERRAIN_MOVE_COST[to.terrain];
  if (!Number.isFinite(base)) return Infinity;
  const delta = to.elevation - from.elevation;
  if (Math.abs(delta) > MOVE.maxStepLevels) return Infinity;
  let cost = base + Math.max(0, delta) * MOVE.climbCostPerLevel;
  if (cleared && !cleared.has(hexKey(to.coord))) cost *= MOVE.fogCostMult;
  return cost;
}

export interface PathResult {
  /** Inclusive of start and goal; empty when unreachable. */
  path: Axial[];
  cost: number;
}

export function findPath(map: HoleMap, start: Axial, goal: Axial, opts: PathOptions = {}): PathResult {
  const startCell = cellAt(map, start);
  const goalCell = cellAt(map, goal);
  if (!startCell || !goalCell) return { path: [], cost: Infinity };
  if (!Number.isFinite(TERRAIN_MOVE_COST[goalCell.terrain])) return { path: [], cost: Infinity };
  const goalKey = hexKey(goal);
  const startKey = hexKey(start);
  if (goalKey === startKey) return { path: [start], cost: 0 };

  const maxExp = opts.maxExpansions ?? 20000;
  const gScore = new Map<HexKey, number>([[startKey, 0]]);
  const cameFrom = new Map<HexKey, HexKey>();
  const closed = new Set<HexKey>();
  // Binary-heap-free open list: maps are small (par-3 ≈ 300 cells). Keep a
  // simple array and scan — deterministic and plenty fast at this size.
  const open: Array<{ key: HexKey; coord: Axial; f: number; order: number }> = [
    { key: startKey, coord: start, f: hexDistance(start, goal), order: 0 },
  ];
  let seq = 1;
  let expansions = 0;

  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i];
      const b = open[bi];
      if (a.f < b.f || (a.f === b.f && a.order < b.order)) bi = i;
    }
    const cur = open.splice(bi, 1)[0];
    if (cur.key === goalKey) {
      const path: Axial[] = [];
      let k: HexKey | undefined = cur.key;
      while (k) {
        path.push(cellAt(map, parseKeyFast(k))!.coord);
        k = cameFrom.get(k);
      }
      path.reverse();
      return { path, cost: gScore.get(goalKey)! };
    }
    if (closed.has(cur.key)) continue;
    closed.add(cur.key);
    if (++expansions > maxExp) break;
    const curCell = cellAt(map, cur.coord)!;
    const g = gScore.get(cur.key)!;
    for (const n of neighbors(cur.coord)) {
      const nc = cellAt(map, n);
      if (!nc) continue;
      const nk = hexKey(n);
      if (closed.has(nk)) continue;
      const c = stepCost(curCell, nc, opts.cleared);
      if (!Number.isFinite(c)) continue;
      const ng = g + c;
      const prev = gScore.get(nk);
      if (prev !== undefined && ng >= prev) continue;
      gScore.set(nk, ng);
      cameFrom.set(nk, cur.key);
      open.push({ key: nk, coord: n, f: ng + hexDistance(n, goal), order: seq++ });
    }
  }
  return { path: [], cost: Infinity };
}

function parseKeyFast(k: HexKey): Axial {
  const i = k.indexOf(',');
  return { q: Number(k.slice(0, i)), r: Number(k.slice(i + 1)) };
}
