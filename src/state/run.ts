import { MOVE } from '../core/config';
import { hexKey, hexRange, type Axial, type HexKey } from '../hex/coords';
import { cellAt, type HoleMap } from '../hex/map';
import { resolveLanding } from '../rules/landing';
import type { ShotRecord } from '../shot/types';

/** Per-run state (resets per run). Pure reducers — no DOM, no physics, no
 *  floats that came out of a flight: only `ShotRecord` (hexes + enums)
 *  enters here. The Ledger fields (day, daylight, resources, structures)
 *  land in step 3. */
export interface RunState {
  seed: string;
  holeIndex: number;
  /** Hexes the ball's blessing has cut the fog from (visible). */
  clearedHexes: Set<HexKey>;
  /** Hexes you hold (yours to harvest at night). Always ⊆ cleared. */
  claimedHexes: Set<HexKey>;
  partyHex: Axial;
  ballHex: Axial;
  /** Hexes entered this hole. */
  stepsTaken: number;
  /** Strokes on the current hole (penalties included). */
  strokes: number;
  /** Strokes over the whole run — also keys each shot's rng stream. */
  strokesTotal: number;
  holed: boolean;
  /** Last landing note for the HUD ('drop' / 'replay'). */
  lastNote: 'drop' | 'replay' | null;
}

export function beginRun(seed: string, map: HoleMap): RunState {
  const cleared = new Set<HexKey>();
  for (const h of hexRange(map.tee, MOVE.teeRevealRadius)) {
    if (cellAt(map, h)) cleared.add(hexKey(h));
  }
  return {
    seed,
    holeIndex: 0,
    clearedHexes: cleared,
    claimedHexes: new Set([hexKey(map.tee)]),
    partyHex: { ...map.tee },
    ballHex: { ...map.tee },
    stepsTaken: 0,
    strokes: 0,
    strokesTotal: 0,
    holed: false,
    lastNote: null,
  };
}

/** Union cleared hexes (a shot's carved corridor). Returns a new state. */
export function clearHexes(state: RunState, hexes: Iterable<Axial>): RunState {
  const cleared = new Set(state.clearedHexes);
  for (const h of hexes) cleared.add(hexKey(h));
  return { ...state, clearedHexes: cleared };
}

/** Claim hexes (also clears them, so claimed ⊆ cleared holds). */
export function claimHexes(state: RunState, hexes: Iterable<Axial>): RunState {
  const list = [...hexes];
  const s = clearHexes(state, list);
  const claimed = new Set(s.claimedHexes);
  for (const h of list) claimed.add(hexKey(h));
  return { ...s, claimedHexes: claimed };
}

/** Seed for the rng stream of the next shot (resume-safe: keyed, not
 *  draw-counted). */
export function shotSeed(state: RunState): string {
  return `${state.seed}:h${state.holeIndex}:s${state.strokesTotal}`;
}

/** Apply a resolved shot: the stroke (plus any penalty) is counted, the ball
 *  moves per the landing rules, the corridor is cleared and claimed. */
export function applyShot(state: RunState, map: HoleMap, rec: ShotRecord): RunState {
  const landing = resolveLanding(map, state.ballHex, rec);
  const s = claimHexes(state, rec.clearedPath);
  return {
    ...s,
    ballHex: landing.ballHex,
    strokes: state.strokes + 1 + landing.penalty,
    strokesTotal: state.strokesTotal + 1 + landing.penalty,
    holed: rec.terminal === 'holed',
    lastNote: landing.note,
  };
}

/** The party enters one hex. */
export function stepParty(state: RunState, to: Axial): RunState {
  return { ...state, partyHex: { ...to }, stepsTaken: state.stepsTaken + 1 };
}

export function isCleared(state: RunState, h: Axial): boolean {
  return state.clearedHexes.has(hexKey(h));
}

export function isClaimed(state: RunState, h: Axial): boolean {
  return state.claimedHexes.has(hexKey(h));
}
