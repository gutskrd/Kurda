/**
 * The random draws a solo round is made with: the same for the same seed and
 * different for another, every item handed out once, a draw that stops early
 * costing only what it handed out, and one keyed digest per draw however long
 * the list it draws from.
 */
import { describe, expect, it, vi } from 'vitest';
import * as exercises from '../content/exercises.js';
import { drawFor, unitFor } from './draw.js';

describe('a seeded draw', () => {
  it('is the same for the same seed, and another for another', () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    expect(drawFor('round-1:0').shuffle(items)).toEqual(drawFor('round-1:0').shuffle(items));
    expect(drawFor('round-1:0').shuffle(items)).not.toEqual(drawFor('round-1:1').shuffle(items));
    expect(drawFor('round-1:0').next()).toBe(drawFor('round-1:0').next());
  });

  it('hands every item out once, in a shuffle, a lazy order and a sample alike', () => {
    const items = Array.from({ length: 200 }, (_, i) => `w${i}`);
    const draw = drawFor('seed');
    expect([...draw.shuffle(items)].sort()).toEqual([...items].sort());
    expect(new Set([...draw.order(items)]).size).toBe(items.length);
    const some = draw.sample(items, 7);
    expect(some).toHaveLength(7);
    expect(new Set(some).size).toBe(7);
    expect(draw.sample(items.slice(0, 3), 10)).toHaveLength(3);
    expect(draw.sample(items, 0)).toEqual([]);
  });

  it('spreads its numbers over the range', () => {
    const draw = drawFor('spread');
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) buckets[draw.below(4)]!++;
    for (const n of buckets) expect(n).toBeGreaterThan(800);
    for (let i = 0; i < 100; i++) {
      const x = draw.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('costs one keyed digest a draw, and a few steps for the few items taken from a long list', () => {
    const digest = vi.spyOn(exercises, 'keyedDigest');
    try {
      const words = Array.from({ length: 50_000 }, (_, i) => `w${i}`);
      const draw = drawFor('decoys');
      const order = draw.order(words);
      const taken = [order.next().value, order.next().value, order.next().value];
      expect(taken.every((w) => typeof w === 'string')).toBe(true);
      expect(digest).toHaveBeenCalledTimes(1);
    } finally {
      digest.mockRestore();
    }
  });
});

describe('a keyed number for a label', () => {
  it('is the same for the same seed and label, another for another of either, and always from 0 up to 1', () => {
    const unit = unitFor('lobby-seed');
    expect(unit('seat:1:tiles:a')).toBe(unit('seat:1:tiles:a'));
    expect(unit('seat:1:tiles:a')).toBe(unitFor('lobby-seed')('seat:1:tiles:a'));
    expect(unit('seat:1:tiles:a')).not.toBe(unit('seat:1:tiles:b'));
    expect(unit('seat:1:tiles:a')).not.toBe(unitFor('another-seed')('seat:1:tiles:a'));
    const many = Array.from({ length: 400 }, (_, i) => unit(`label-${i}`));
    for (const n of many) expect(n >= 0 && n < 1).toBe(true);
    expect(new Set(many).size).toBe(many.length);
  });

  it('keeps a seed and a label apart: one is never read as the end of the other', () => {
    expect(unitFor('ab')('c')).not.toBe(unitFor('a')('bc'));
  });

  it('is made with the server’s keyed digest, so it cannot be worked out from the seed alone', () => {
    const digest = vi.spyOn(exercises, 'keyedDigest');
    unitFor('lobby-seed')('target:1');
    expect(digest).toHaveBeenCalledTimes(1);
    digest.mockRestore();
  });
});
