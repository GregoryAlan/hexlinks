import { parseAsciiMap, type AsciiMapSpec } from '../hex/map';

/** "The Qualifying Hole" — the hand-authored par-3 tutorial. Portrait: tee at
 *  the bottom, green at the top. Relief (PLAN.md §Tutorial beats): the tee
 *  sits on a low terrace; the fairway climbs gently through a saddle; a
 *  bunker is carved into the front of a raised green; the bold line runs up
 *  the right past the trees over a ridge; the pond drowns the low left.
 *  Elevation digits are the second character of each token. */
export const TUTORIAL_SPEC: AsciiMapSpec = {
  seed: 'tutorial:qualifying-hole',
  name: 'The Qualifying Hole',
  par: 3,
  //     col: 0  1  2  3  4  5  6  7  8  9  10
  rows: [
    'O0 O0 O0 O2 X2 X3 X3 X3 O3 O3 O3',
    'O0 X1 X2 X3 R3 R3 G3 X3 X3 O3 O3',
    'O0 X1 R2 G3 G3 G3 G3 G3 R3 X3 O3',
    'X0 R1 R2 G3 G3 G3 G3 G3 R3 X3 O3',
    'X0 R1 R2 S2 G3 G3 G3 R3 R3 X3 O3',
    'X0 R1 R1 S2 S2 R2 R2 R3 X3 X3 O3',
    'X0 R1 F1 F2 F2 F2 R2 R3 X3 O3 O3',
    'X0 R1 F1 F1 F2 F2 R2 R2 X3 X3 O3',
    'W0 R0 F1 F1 F1 F2 R2 X2 X2 X3 O3',
    'W0 W0 R0 F1 F1 F1 R1 R2 X2 X2 O2',
    'W0 W0 R0 F1 F1 F1 F1 R1 R2 X2 O2',
    'W0 W0 W0 R0 F1 F1 F1 R1 R1 X1 O1',
    'W0 W0 W0 R0 F1 F1 F1 F1 R1 X1 O1',
    'O0 W0 W0 R0 R0 F1 F1 F1 R1 R1 O1',
    'O0 W0 R0 R0 P0 P0 F1 F1 R1 X1 O1',
    'O0 R0 R0 P0 P0 F1 F1 F1 R1 X1 O1',
    'O0 R0 P0 P0 F1 F1 F1 R1 R1 X1 O1',
    'O0 R0 P0 F1 F1 F1 F1 R1 X1 O1 O1',
    'O0 R0 R0 F1 F1 T1 F1 R1 X1 O1 O1',
    'O0 O0 R0 R0 F1 F1 F1 R1 R1 O1 O1',
    'O0 O0 O0 R0 R0 R0 R0 R0 O0 O0 O0',
  ],
  tee: [5, 18],
  pin: [5, 2],
};

export function tutorialMap() {
  return parseAsciiMap(TUTORIAL_SPEC);
}
