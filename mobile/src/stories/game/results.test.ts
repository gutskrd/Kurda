import { describe, expect, it } from 'vitest';
import type { StoryGameReviewItem, StoryGameStanding } from '@kurda/shared';
import { bySeat, duoTotals, reviewOrder, standingsLayout } from './results';

const s = (seat: number, correct: number, place: number): StoryGameStanding => ({
  seat,
  name: null,
  avatarUrl: null,
  isMe: seat === 1,
  score: correct * 100,
  correct,
  place,
});

describe('story results layout', () => {
  it('uses a podium only from four players; a duo has no places; three are in seat order', () => {
    expect(standingsLayout('solo', [s(1, 3, 1)])).toBe('solo');
    expect(standingsLayout('duo', [s(1, 4, 1), s(2, 3, 2)])).toBe('duo');
    expect(standingsLayout('group', [s(1, 4, 1), s(2, 3, 2), s(3, 2, 3)])).toBe('seats');
    expect(standingsLayout('group', [s(1, 4, 1), s(2, 3, 2), s(3, 2, 3), s(4, 1, 4)])).toBe('podium');
    // a group game two people finished is shown as a pair
    expect(standingsLayout('group', [s(1, 4, 1), s(2, 3, 2)])).toBe('duo');
  });

  it('adds a duo’s right answers together, out of both totals', () => {
    expect(duoTotals([s(1, 4, 1), s(2, 3, 2)], 5)).toEqual({ together: 7, outOf: 10 });
  });

  it('lists three players by seat, whoever won', () => {
    expect(bySeat([s(3, 5, 1), s(1, 2, 3), s(2, 4, 2)]).map((x) => x.seat)).toEqual([1, 2, 3]);
  });

  it('puts the missed questions (and the unanswered) first, each in question order', () => {
    const item = (index: number, myChoice: number | null): StoryGameReviewItem =>
      ({ index, correctIndex: 0, myChoice }) as StoryGameReviewItem;
    expect(reviewOrder([item(0, 0), item(1, 2), item(2, null), item(3, 0)]).map((r) => r.index)).toEqual([1, 2, 0, 3]);
  });
});
