import { describe, expect, it } from 'vitest';
import {
  firstRoundMatches,
  nextPowerOfTwo,
  parentSlot,
  roundsForSize,
  seedByRating,
  seedOrder,
  type Seed,
} from './bracket.js';

const seeds = (n: number): Seed[] =>
  Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, seed: i + 1 }));

describe('nextPowerOfTwo', () => {
  it('rounds up to the next power of two', () => {
    expect(nextPowerOfTwo(8)).toBe(8);
    expect(nextPowerOfTwo(5)).toBe(8);
    expect(nextPowerOfTwo(33)).toBe(64);
    expect(nextPowerOfTwo(1)).toBe(1);
  });
});

describe('roundsForSize', () => {
  it('is log2 of the bracket size', () => {
    expect(roundsForSize(8)).toBe(3);
    expect(roundsForSize(64)).toBe(6);
  });
});

describe('seedOrder', () => {
  it('produces the standard bracket seeding', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });
  it('keeps the top two seeds apart until the final', () => {
    const order = seedOrder(8);
    const half = order.length / 2;
    expect(order.slice(0, half)).toContain(1);
    expect(order.slice(half)).toContain(2);
  });
});

describe('firstRoundMatches', () => {
  it('pairs top vs bottom seed for a full bracket', () => {
    const m = firstRoundMatches(seeds(8));
    expect(m).toHaveLength(4);
    expect(m[0]).toEqual({ slot: 0, a: 'u1', b: 'u8' });
    expect(m[1]).toEqual({ slot: 1, a: 'u4', b: 'u5' });
    expect(m[2]).toEqual({ slot: 2, a: 'u2', b: 'u7' });
    expect(m[3]).toEqual({ slot: 3, a: 'u3', b: 'u6' });
  });

  it('gives byes to the top seeds when the field is not a power of two', () => {
    // 6 players → size 8, seeds 7 & 8 are missing → seeds 1 & 2 get byes
    const m = firstRoundMatches(seeds(6));
    expect(m).toHaveLength(4);
    const byeSeed1 = m.find((x) => x.a === 'u1')!;
    const byeSeed2 = m.find((x) => x.a === 'u2')!;
    expect(byeSeed1.b).toBeNull();
    expect(byeSeed2.b).toBeNull();
    // the lower seeds still play real matches
    expect(m.find((x) => x.a === 'u4')!.b).toBe('u5');
    expect(m.find((x) => x.a === 'u3')!.b).toBe('u6');
  });
});

describe('parentSlot', () => {
  it('feeds even slots into side a and odd into side b of the next round', () => {
    expect(parentSlot(0)).toEqual({ slot: 0, side: 'a' });
    expect(parentSlot(1)).toEqual({ slot: 0, side: 'b' });
    expect(parentSlot(2)).toEqual({ slot: 1, side: 'a' });
    expect(parentSlot(3)).toEqual({ slot: 1, side: 'b' });
  });
});

describe('seedByRating', () => {
  it('assigns seed 1 to the highest rating, breaking ties by userId', () => {
    const result = seedByRating([
      { userId: 'b', rating: 1200 },
      { userId: 'a', rating: 1500 },
      { userId: 'd', rating: 1000 },
      { userId: 'c', rating: 1000 },
    ]);
    expect(result).toEqual([
      { userId: 'a', seed: 1 },
      { userId: 'b', seed: 2 },
      { userId: 'c', seed: 3 },
      { userId: 'd', seed: 4 },
    ]);
  });
});
