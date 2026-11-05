/**
 * A random order every replica agrees on: the multiplayer games draw who goes
 * first, who speaks when and how options are laid out from the seed a game
 * was started with, never from a clock or `Math.random`, so their rules stay
 * pure and a state can be judged anywhere.
 */
import { seededUnit } from '../last-letter/rules.js';

/** The items in an order drawn from the seed and a salt. */
export function seededOrder<T>(seed: string, salt: string, items: readonly T[]): T[] {
  return items
    .map((item, i) => ({ item, k: seededUnit(seed, `${salt}:${i}`) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.item);
}
