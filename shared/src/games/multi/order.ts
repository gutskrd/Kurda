/** A random order every replica agrees on, drawn from the game's seed rather than a clock or `Math.random`, so the rules stay pure. */
import { seededUnit } from '../last-letter/rules.js';

/** The items in an order drawn from the seed and a salt. */
export function seededOrder<T>(seed: string, salt: string, items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, k: seededUnit(seed, `${salt}:${i}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
}
