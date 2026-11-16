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
