import seedrandom from 'seedrandom';

/** Deterministic RNG. All game randomness flows through instances of this —
 *  never Math.random — so daily courses are identical for everyone. */
export interface Rng {
  /** Uniform float in [0, 1). */
  float(): number;
  /** Inclusive integer in [min, max] (matches the original's `between`). */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability 1/n (matches the original's `between(1,n)===1`). */
  oneIn(n: number): boolean;
  pick<T>(arr: readonly T[]): T;
}

export function makeRng(seed: string): Rng {
  const rand = seedrandom(seed);
  return {
    float: () => rand(),
    int: (min, max) => Math.floor(rand() * (max + 1 - min) + min),
    range: (min, max) => rand() * (max - min) + min,
    oneIn(n) {
      return this.int(1, n) === 1;
    },
    pick(arr) {
      return arr[Math.floor(rand() * arr.length)];
    },
  };
}
