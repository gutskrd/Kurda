import { describe, expect, it } from 'vitest';
import { BALANCE_BOARDS, isBalanceBoard, isBoardType, isWeeklyBoard, rankForScore, withRanks, withSelf } from './rank.js';

describe('isBoardType', () => {
  it('accepts the known board types, and the frozen rating board is gone', () => {
    expect(isBoardType('rating')).toBe(false);
    expect(isBoardType('weekly_xp')).toBe(true);
    expect(isBoardType('all_time_xp')).toBe(true);
    expect(isBoardType('zer')).toBe(true);
    // the wallet’s word for the currency is not a board of its own
    expect(isBoardType('gewher')).toBe(false);
    expect(isBoardType('nope')).toBe(false);
  });

  it('knows which boards rank a balance, and the wallet currency behind each', () => {
    expect(isBalanceBoard('weekly_xp')).toBe(false);
    expect(isBalanceBoard('all_time_xp')).toBe(false);
    expect(isBalanceBoard('zer')).toBe(true);
    expect(BALANCE_BOARDS).toEqual({ zer: 'zer' });
  });

  it('knows the one board that starts afresh each week', () => {
    expect(isWeeklyBoard('weekly_xp')).toBe(true);
    for (const type of ['all_time_xp', 'zer'] as const) expect(isWeeklyBoard(type)).toBe(false);
  });
});

describe('rankForScore', () => {
  const scores = [500, 300, 300, 100];
  it('ranks strictly-higher scores above and ties share a rank', () => {
    expect(rankForScore(scores, 500)).toBe(1);
    expect(rankForScore(scores, 300)).toBe(2); // two 300s tie at rank 2
    expect(rankForScore(scores, 100)).toBe(4);
  });
  it('gives an excluded user a plausible rank even if absent from the list', () => {
    // score 400 isn't in the list but ranks below the single 500
    expect(rankForScore(scores, 400)).toBe(2);
    // a top score ranks first
    expect(rankForScore(scores, 999)).toBe(1);
  });
});

describe('withRanks', () => {
  const row = (score: number, id = String(score)) => ({ userId: id, username: id, score });

  it('numbers a sorted list from 1', () => {
    const ranked = withRanks([row(9), row(5)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
  });

  it('gives a tie one place and skips the places it took, as rankForScore does', () => {
    const ranked = withRanks([row(500), row(300, 'b'), row(300, 'c'), row(100)]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it('continues a later page from where the board is, even in the middle of a tie', () => {
    // the board is 500, 300, 300, 300, 100: a page of two from position 2 opens on the tie at 2
    expect(withRanks([row(300, 'c'), row(300, 'd')], 2, 2).map((r) => r.rank)).toEqual([2, 2]);
    expect(withRanks([row(100)], 4).map((r) => r.rank)).toEqual([5]);
  });
});

describe('withSelf', () => {
  const at = (score: number, userId: string) => ({ userId, username: userId, score });

  it('puts a reader the board leaves out in their own place, so nobody else’s place is also theirs', () => {
    // the owner’s case: 1,165 and 135 listed, the reader holding 859 between them
    const rows = withSelf([at(1165, 'a'), at(135, 'b')], at(859, 'me'));
    expect(withRanks(rows).map((r) => [r.userId, r.rank])).toEqual([
      ['a', 1],
      ['me', 2],
      ['b', 3],
    ]);
  });

  it('goes ahead of anyone they tie with, sharing the place, and last when below everyone', () => {
    expect(withSelf([at(9, 'a'), at(5, 'b')], at(5, 'me')).map((r) => r.userId)).toEqual(['a', 'me', 'b']);
    expect(withSelf([at(9, 'a')], at(2, 'me')).map((r) => r.userId)).toEqual(['a', 'me']);
    expect(withSelf([], at(2, 'me')).map((r) => r.userId)).toEqual(['me']);
  });

  it('leaves a board that already lists the reader as it is', () => {
    const rows = [at(9, 'me'), at(5, 'b')];
    expect(withSelf(rows, at(7, 'me'))).toBe(rows);
  });
});
