import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { Drawable } from 'roughjs/bin/core';
import { COLORS } from '../core/config';
import type { TerrainSpec } from '../core/types';

/** Rough.js is far too slow to regenerate squiggles every frame. Drawables
 *  are generated ONCE per body with a fixed per-body seed — stable squiggle,
 *  no boiling — and replayed cheaply via a bound RoughCanvas. */

export interface RoughStyles {
  fill: string;
  stroke: string;
}

export function stylesFor(kind: TerrainSpec['kind']): RoughStyles {
  switch (kind) {
    case 'ice':
      return { fill: COLORS.iceFill, stroke: COLORS.iceStroke };
    case 'sand':
      return { fill: COLORS.sandFill, stroke: COLORS.sandStroke };
    case 'green':
      return { fill: COLORS.greenFill, stroke: COLORS.greenStroke };
    default:
      return { fill: COLORS.platformFill, stroke: COLORS.platformStroke };
  }
}

/** Deterministic 32-bit hash → rough.js seed (must be > 0). */
export function seedFrom(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 2147483646) + 1;
}

const generator = rough.generator();

export class RoughCache {
  private cache = new Map<string, Drawable>();

  clear(): void {
    this.cache.clear();
  }

  /** Tattoo-flash linework: bold, fairly clean outlines (low roughness,
   *  thick uniform stroke) over cross-hatch/solid-ish fills. */
  polygon(
    key: string,
    points: ReadonlyArray<{ x: number; y: number }>,
    styles: RoughStyles,
    opts: { fillStyle?: string; hachureGap?: number; roughness?: number } = {},
  ): Drawable {
    let d = this.cache.get(key);
    if (!d) {
      d = generator.polygon(
        points.map((p) => [p.x, p.y] as [number, number]),
        {
          fill: styles.fill,
          stroke: styles.stroke,
          strokeWidth: 7,
          fillStyle: opts.fillStyle ?? 'cross-hatch',
          fillWeight: 2.5,
          hachureGap: opts.hachureGap ?? 20,
          roughness: opts.roughness ?? 0.9,
          seed: seedFrom(key),
        },
      );
      this.cache.set(key, d);
    }
    return d;
  }
}

/** One-shot rough line (aim arrow) with a fixed seed so it doesn't boil. */
export function roughLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  seedKey: string,
): Drawable {
  return generator.line(x1, y1, x2, y2, {
    stroke,
    strokeWidth: 6,
    roughness: 1.2,
    seed: seedFrom(seedKey),
  });
}

/** Bind a RoughCanvas for replaying drawables into a specific canvas. */
export function roughOn(canvas: HTMLCanvasElement): RoughCanvas {
  return rough.canvas(canvas);
}
