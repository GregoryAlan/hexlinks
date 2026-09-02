import { parseAsciiMap, type AsciiMapSpec } from '../hex/map';

/** Stair-step fixture: a terrace climbing 0→1→2→3 with a 4-level cliff on
 *  the right, a sunk bunker, a pond in the low, trees on the plateau and a
 *  raised green. Built to shake out painter's-order bugs at cliff edges and
 *  to test the A* cliff rule (the 0→4 wall is impassable; the terrace is
 *  not). Keep it small enough to eyeball. */
export const STAIR_STEP_SPEC: AsciiMapSpec = {
  seed: 'fixture:stair-step',
  name: 'Stair-step fixture',
  par: 3,
  //     col: 0  1  2  3  4  5  6  7
  rows: [
    'O0 R0 R0 R0 R0 R0 R0 O0',
    'R0 F1 F1 G3 G3 X3 R4 O0',
    'R0 F1 F2 G3 F3 F3 R4 R4',
    'F0 F1 F2 F2 S1 F3 X4 R4',
    'F0 F0 F1 F1 F2 F2 R4 R4',
    'W0 F0 F0 F1 F1 F2 R4 O0',
    'W0 W0 F0 F0 F1 F1 R0 O0',
    'R0 F0 F0 T0 F0 R0 R0 O0',
    'O0 R0 R0 R0 R0 R0 O0 O0',
  ],
  tee: [3, 7],
  pin: [3, 1],
};

export function stairStepMap() {
  return parseAsciiMap(STAIR_STEP_SPEC);
}
