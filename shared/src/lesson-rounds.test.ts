import { describe, expect, it } from 'vitest';
import { PATH_RING, TOPIC_STARS, nextInRound, ringPieces, roundStars, starPath, topicRounds } from './lesson-rounds.js';

/** The points a path's data moves and draws to, as numbers. */
const pointsOf = (d: string): Array<[number, number]> => {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  return d.startsWith('M') && d.includes('A') ? [[nums[0]!, nums[1]!], [nums[nums.length - 2]!, nums[nums.length - 1]!]] : [];
};

describe('a topic’s rounds', () => {
  it('fills a piece of the first round for each lesson finished once', () => {
    expect(topicRounds([0, 0, 0, 0])).toEqual({ rounds: 0, pieces: 0 });
    expect(topicRounds([1, 0, 0, 0])).toEqual({ rounds: 0, pieces: 1 });
    expect(topicRounds([1, 1, 0, 1])).toEqual({ rounds: 0, pieces: 3 });
    // a lesson played over and over is still one piece of the round
    expect(topicRounds([4, 0, 0, 0])).toEqual({ rounds: 0, pieces: 1 });
  });

  it('makes the ring whole and earns the first star when every lesson is finished, and starts the next round empty', () => {
    expect(topicRounds([1, 1, 1, 1])).toEqual({ rounds: 1, pieces: 0 });
    expect(topicRounds([2, 1, 2, 1])).toEqual({ rounds: 1, pieces: 2 });
    expect(topicRounds([2, 2, 2, 2])).toEqual({ rounds: 2, pieces: 0 });
    expect(topicRounds([3, 3, 2, 3])).toEqual({ rounds: 2, pieces: 3 });
  });

  it('stops at three stars, the ring whole from then on however often it is played', () => {
    expect(TOPIC_STARS).toBe(3);
    expect(topicRounds([3, 3, 3, 3])).toEqual({ rounds: 3, pieces: 4 });
    expect(topicRounds([9, 3, 5, 4])).toEqual({ rounds: 3, pieces: 4 });
  });

  it('cuts the ring into as many pieces as the topic has lessons', () => {
    expect(topicRounds([1, 1, 0])).toEqual({ rounds: 0, pieces: 2 });
    expect(topicRounds([2, 1, 1, 1, 1, 1])).toEqual({ rounds: 1, pieces: 1 });
    expect(topicRounds([3])).toEqual({ rounds: 3, pieces: 1 });
    expect(topicRounds([])).toEqual({ rounds: 0, pieces: 0 });
  });

  it('reads a count that is not a whole number of times as the nearest one that is', () => {
    expect(topicRounds([Number.NaN, -1, 1.7, 2])).toEqual({ rounds: 0, pieces: 2 });
  });
});

describe('the ring round a topic’s stop', () => {
  const { cx, cy, rx, ry, width, pad, box } = PATH_RING;

  it('is cut into one piece for each lesson, starting at the top and going round clockwise', () => {
    expect(ringPieces(0)).toEqual([]);
    const four = ringPieces(4);
    expect(four).toHaveLength(4);
    const [[x0, y0], [x1, y1]] = pointsOf(four[0]!) as [[number, number], [number, number]];
    // the first piece starts just past the top and ends just short of the right-hand side, going clockwise
    expect(x0).toBeGreaterThan(cx);
    expect(y0).toBeLessThan(cy - ry + 2);
    expect(x1).toBeGreaterThan(cx + rx - 2);
    expect(y1).toBeLessThan(cy);
    expect(four[0]).toMatch(/A45 44 0 0 1 /);
    // every piece is the same arc turned, so the gaps between them are alike
    const ends = four.map((d) => pointsOf(d));
    expect(Math.round(ends[2]![0]![0])).toBe(Math.round(2 * cx - ends[0]![0]![0]));
  });

  it('leaves a gap between each two pieces, never more than a third of a piece', () => {
    for (const of of [1, 2, 3, 4, 6, 8]) {
      const pieces = ringPieces(of);
      expect(pieces).toHaveLength(of);
      for (let k = 0; k < of; k++) {
        const end = pointsOf(pieces[k]!)[1]!;
        const next = pointsOf(pieces[(k + 1) % of]!)[0]!;
        // a gap, but a short one: the ring still reads as a ring
        const apart = Math.hypot(end[0] - next[0], end[1] - next[1]);
        expect(apart, `${of} pieces, after ${k}`).toBeGreaterThan(width);
        expect(apart, `${of} pieces, after ${k}`).toBeLessThan(2 * Math.PI * rx * (1 / of / 3) + 1);
      }
    }
    // one lesson is one long piece, its gap at the top
    expect(ringPieces(1)[0]).toMatch(/A45 44 0 1 1 /);
  });

  it('stays inside the box an app lays over the stop', () => {
    expect(-pad + box).toBeGreaterThanOrEqual(cx + rx + width / 2);
    expect(-pad).toBeLessThanOrEqual(cy - ry - width / 2);
    expect(-pad + box).toBeGreaterThanOrEqual(cy + ry + width / 2);
  });
});

describe('a topic’s stars', () => {
  it('stands one, two or three stars on the coin, and none before the first round', () => {
    expect(roundStars(0)).toEqual([]);
    expect(roundStars(1)).toHaveLength(1);
    expect(roundStars(2)).toHaveLength(2);
    expect(roundStars(3)).toHaveLength(3);
    expect(roundStars(7)).toEqual(roundStars(3));
    // each within the coin's face (72 by 62, round its middle at 36, 30), and side by side without touching
    for (const rounds of [1, 2, 3]) {
      const stars = roundStars(rounds);
      for (const s of stars) expect(((s.x - 36) / 34) ** 2 + ((s.y - 30) / 29) ** 2, `${rounds}`).toBeLessThan(1);
      for (let i = 1; i < stars.length; i++) expect(stars[i]!.x - stars[i - 1]!.x).toBeGreaterThan(stars[i]!.r + stars[i - 1]!.r - 6);
    }
  });

  it('draws a star as ten corners, point up', () => {
    const d = starPath(36, 30, 10);
    expect(d.match(/[ML]/g)).toHaveLength(10);
    expect(d.startsWith('M36 20')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
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
