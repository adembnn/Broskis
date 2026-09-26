// Hasard à graine (mulberry32) : même graine = même partie. En ?demo=1 la graine est fixe.
export interface Rng {
  (): number;
  seed: number;
  setSeed(n: number): void;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (() => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.seed = seed;
  next.setSeed = (n) => { s = n >>> 0; next.seed = n; };
  next.range = (min, max) => min + next() * (max - min);
  next.int = (min, max) => Math.floor(next.range(min, max + 1));
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  return next;
}
