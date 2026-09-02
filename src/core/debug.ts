/** Debug toggles, set once by main.ts from the URL (?debug=order,...).
 *  Read-only everywhere else; never affects game state. */
export const DEBUG = {
  /** Outline painter's order: number every cell in draw order. */
  drawOrder: false,
  /** Draw the A* path cost on the walk preview. */
  pathCost: false,
  /** Fog layer without mist strokes (isolating wash artifacts). */
  noMist: false,
  /** Fog layer without the paper wash (mist only). */
  noWash: false,
};
