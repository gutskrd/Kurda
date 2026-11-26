import { describe, expect, it } from 'vitest';
import { PATH_BAR, TOPIC_STARS, barPieces, nextInRound, roundStars, starPath, topicRounds } from './lesson-rounds.js';
import { PATH_STAMP_ART } from './art/path-land.js';

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

describe('a topic’s stars', () => {
  it('lights one star for each full round, none before the first and no more than three', () => {
    expect(roundStars(0)).toEqual([]);
    expect([1, 2, 3, 7].map((r) => roundStars(r).length)).toEqual([1, 2, 3, 3]);
    expect(TOPIC_STARS).toBe(3);
  });

  it('stands them along the tile’s near edge, on its face and clear of the seal above them', () => {
    // the seal's foot, in the stop's points (its canvas laid from 8, 2)
    const sealFoot = 2 + PATH_STAMP_ART.cy + PATH_STAMP_ART.r;
    for (const rounds of [1, 2, 3]) {
      const stars = roundStars(rounds);
      for (const s of stars) {
        // on the tile's face (72 by 60, round its middle at 36, 30)
        expect(((s.x - 36) / 34) ** 2 + ((s.y + s.r - 30) / 30) ** 2, `${rounds}`).toBeLessThan(1);
        expect(s.y - s.r, `${rounds}`).toBeGreaterThan(sealFoot);
      }
      for (let i = 1; i < stars.length; i++) expect(stars[i]!.x - stars[i - 1]!.x).toBeGreaterThan(stars[i]!.r + stars[i - 1]!.r - 4);
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
