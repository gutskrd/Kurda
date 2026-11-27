import { describe, expect, it } from 'vitest';
import { PATH_BAR, TOPIC_STARS, applePath, barPieces, nextInRound, sealApples, topicRounds } from './lesson-rounds.js';

describe('a topic’s rounds', () => {
  it('fills a piece of the first round for each lesson finished once', () => {
    expect(topicRounds([0, 0, 0, 0])).toEqual({ rounds: 0, pieces: 0 });
    expect(topicRounds([1, 0, 0, 0])).toEqual({ rounds: 0, pieces: 1 });
    expect(topicRounds([1, 1, 0, 1])).toEqual({ rounds: 0, pieces: 3 });
    // a lesson played over and over is still one piece of the round
    expect(topicRounds([4, 0, 0, 0])).toEqual({ rounds: 0, pieces: 1 });
  });

  it('fills the bar and counts the first round when every lesson is finished, and starts the next round empty', () => {
    expect(topicRounds([1, 1, 1, 1])).toEqual({ rounds: 1, pieces: 0 });
    expect(topicRounds([2, 1, 2, 1])).toEqual({ rounds: 1, pieces: 2 });
    expect(topicRounds([2, 2, 2, 2])).toEqual({ rounds: 2, pieces: 0 });
    expect(topicRounds([3, 3, 2, 3])).toEqual({ rounds: 2, pieces: 3 });
  });

  it('stops at three rounds, the bar full from then on however often it is played', () => {
    expect(TOPIC_STARS).toBe(3);
    expect(topicRounds([3, 3, 3, 3])).toEqual({ rounds: 3, pieces: 4 });
    expect(topicRounds([9, 3, 5, 4])).toEqual({ rounds: 3, pieces: 4 });
  });

  it('cuts the bar into as many pieces as the topic has lessons', () => {
    expect(topicRounds([1, 1, 0])).toEqual({ rounds: 0, pieces: 2 });
    expect(topicRounds([2, 1, 1, 1, 1, 1])).toEqual({ rounds: 1, pieces: 1 });
    expect(topicRounds([3])).toEqual({ rounds: 3, pieces: 1 });
    expect(topicRounds([])).toEqual({ rounds: 0, pieces: 0 });
  });

  it('reads a count that is not a whole number of times as the nearest one that is', () => {
    expect(topicRounds([Number.NaN, -1, 1.7, 2])).toEqual({ rounds: 0, pieces: 2 });
  });
});

describe('the bar over a topic’s stop', () => {
  const { x, w, h, gap } = PATH_BAR;

  it('is cut into one piece for each lesson, from the start of the line, with small even gaps', () => {
    expect(barPieces(0)).toEqual([]);
    expect(barPieces(1)).toEqual([{ x, w }]);
    const four = barPieces(4);
    expect(four).toHaveLength(4);
    expect(four[0]!.x).toBe(x);
    for (let k = 1; k < four.length; k++) {
      expect(four[k]!.x - (four[k - 1]!.x + four[k - 1]!.w), `gap after ${k - 1}`).toBeCloseTo(gap, 0);
      expect(four[k]!.w).toBe(four[0]!.w);
    }
    expect(four[3]!.x + four[3]!.w).toBeCloseTo(x + w, 0);
  });

  it('spans the tile and a touch more, each piece a bar rather than a dot until there is no other way', () => {
    for (const of of [1, 2, 3, 4, 5, 6]) {
      const pieces = barPieces(of);
      // centred over the 72-point tile, no more than a few points past it either side
      expect(pieces[0]!.x).toBeGreaterThanOrEqual(-4);
      expect(pieces[0]!.x + pieces[pieces.length - 1]!.x + pieces[pieces.length - 1]!.w).toBeCloseTo(72, 0);
      expect(pieces[pieces.length - 1]!.x + pieces[pieces.length - 1]!.w).toBeLessThanOrEqual(76);
      for (const p of pieces) expect(p.w, `${of} pieces`).toBeGreaterThanOrEqual(1.5 * h);
    }
    expect(w).toBeGreaterThanOrEqual(72);
    // so many lessons that only a hairline is left between them
    const many = barPieces(16);
    expect(many[1]!.x - (many[0]!.x + many[0]!.w)).toBeCloseTo(1, 0);
  });

  it('sits above the tile, clear of it', () => {
    expect(PATH_BAR.y + h).toBeLessThan(0);
  });
});

describe('a topic’s apples', () => {
  it('presses one apple into the seal for each full round, at least one and no more than three', () => {
    expect([0, 1, 2, 3, 7].map((r) => sealApples(r).length)).toEqual([1, 1, 2, 3, 3]);
    expect(TOPIC_STARS).toBe(3);
  });

  it('lays them in the seal’s field: one large in the middle, two side by side, three of a size in a triangle', () => {
    // inside the fine line ringing the field, at six tenths of the seal's radius
    for (const rounds of [1, 2, 3]) {
      const apples = sealApples(rounds);
      for (const s of apples) expect(Math.hypot(s.x, s.y) + s.r, `${rounds}`).toBeLessThan(0.6);
      // side by side and apart, the outer ones level and the same size
      const apart = (i: number): number => Math.hypot(apples[i]!.x - apples[i - 1]!.x, apples[i]!.y - apples[i - 1]!.y);
      for (let i = 1; i < apples.length; i++) expect(apart(i)).toBeGreaterThan(apples[i]!.r + apples[i - 1]!.r - 0.02);
      expect(apples[0]!.y).toBe(apples[apples.length - 1]!.y);
      expect(apples[0]!.r).toBe(apples[apples.length - 1]!.r);
    }
    expect(sealApples(1)[0]!.r).toBeGreaterThan(sealApples(2)[0]!.r);
    expect(sealApples(2)[0]!.r).toBeGreaterThan(sealApples(3)[0]!.r);
    // three alike in an equilateral triangle, one above and two below, centred as a group, as far apart as from the ring
    const three = sealApples(3);
    const [l, m, r] = three;
    expect(new Set(three.map((s) => s.r)).size).toBe(1);
    expect(m!.y).toBeLessThan(l!.y);
    expect(m!.x).toBe(0);
    expect(l!.x + r!.x).toBe(0);
    const apart = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
    expect(apart(l!, m!)).toBeCloseTo(apart(l!, r!), 3);
    expect(apart(m!, r!)).toBeCloseTo(apart(l!, r!), 3);
    expect(three.reduce((y, s) => y + s.y, 0)).toBeCloseTo(0, 3);
    const between = apart(l!, r!) - 2 * l!.r;
    const toRing = 0.615 - (Math.hypot(l!.x, l!.y) + l!.r);
    expect(between).toBeCloseTo(toRing, 2);
  });

  it('draws the apple as one body, its stem and its leaf, the leaf out to the upper right, all within its reach', () => {
    const d = applePath(36, 30, 10);
    expect(d.match(/M/g)).toHaveLength(3);
    expect(d.match(/Z/g)).toHaveLength(3);
    const at = (path: string): Array<[number, number]> => {
      const nums = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      return Array.from({ length: nums.length / 2 }, (_, i) => [nums[2 * i]!, nums[2 * i + 1]!] as [number, number]);
    };
    // nothing of it, its curves' handles included, reaches past `r` from its middle, so it stays inside the seal's ring
    for (const [x, y] of at(d)) expect(Math.hypot(x - 36, y - 30)).toBeLessThan(10 * 1.06);
    // the body is as wide on the left as on the right, and the highest point is the leaf's tip, right of the middle
    const [body] = d.split('ZM');
    const xs = at(body!).map(([x]) => x);
    expect(36 - Math.min(...xs)).toBeCloseTo(Math.max(...xs) - 36, 1);
    const top = at(d).reduce((a, b) => (b[1] < a[1] ? b : a));
    expect(top[0]).toBeGreaterThan(36);
    // and it scales and moves with what it is given
    expect(applePath(0, 0, 20)).not.toBe(applePath(0, 0, 10));
    const [x0, y0] = at(applePath(0, 0, 20))[0]!;
    const [x1, y1] = at(applePath(0, 0, 10))[0]!;
    expect(x0).toBeCloseTo(2 * x1, 1);
    expect(y0).toBeCloseTo(2 * y1, 1);
  });
});

describe('the lesson a round plays next', () => {
  it('is the first not finished yet, in the topic’s order', () => {
    expect(nextInRound([0, 0, 0, 0])).toBe(0);
    expect(nextInRound([1, 1, 0, 0])).toBe(2);
    expect(nextInRound([3, 0, 1, 0])).toBe(1);
  });

  it('is the one finished the fewest times once every one has been, the first of them on a tie', () => {
    expect(nextInRound([1, 1, 1, 1])).toBe(0);
    expect(nextInRound([2, 1, 2, 1])).toBe(1);
    expect(nextInRound([3, 3, 2, 3])).toBe(2);
    expect(nextInRound([])).toBe(-1);
  });
});
