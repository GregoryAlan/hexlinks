import { MOVE } from '../core/config';
import { hexKey, hexRange, type Axial, type HexKey } from '../hex/coords';
import { cellAt, type HoleMap } from '../hex/map';

/** Per-run state (resets per run). P1 carries only what traversal needs;
 *  P2 adds strokes/phase/ball, P4 party HP. Pure reducers — no DOM, no
 *  physics, no floats that came out of matter. */
export interface RunState {
  seed: string;
  holeIndex: number;
  /** Hexes the ball's blessing has cut the fog from. */
  clearedHexes: Set<HexKey>;
  /** Where the party stands. */
  partyHex: Axial;
  /** Where the ball rests (P1: on the tee). */
  ballHex: Axial;
  /** Hexes entered this hole (encounter pacing lands in P4). */
  stepsTaken: number;
}

export function beginHole(seed: string, holeIndex: number, map: HoleMap): RunState {
  const cleared = new Set<HexKey>();
  for (const h of hexRange(map.tee, MOVE.teeRevealRadius)) {
    if (cellAt(map, h)) cleared.add(hexKey(h));
  }
  return {
    seed,
    holeIndex,
    clearedHexes: cleared,
    partyHex: { ...map.tee },
    ballHex: { ...map.tee },
    stepsTaken: 0,
  };
}

/** Union cleared hexes (a shot's carved corridor). Returns a new state. */
export function clearHexes(state: RunState, hexes: Iterable<Axial>): RunState {
  const cleared = new Set(state.clearedHexes);
  for (const h of hexes) cleared.add(hexKey(h));
  return { ...state, clearedHexes: cleared };
}

/** The party enters one hex. */
export function stepParty(state: RunState, to: Axial): RunState {
  return { ...state, partyHex: { ...to }, stepsTaken: state.stepsTaken + 1 };
}

export function isCleared(state: RunState, h: Axial): boolean {
  return state.clearedHexes.has(hexKey(h));
}
