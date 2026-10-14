import { describe, expect, it } from 'vitest';
import { cellState, dailyAction, type DailyStatus } from './daily.js';

const status = (over: Partial<DailyStatus> = {}): DailyStatus => ({
  canClaim: false,
  claimableDay: 4,
  reward: 25,
  schedule: [10, 15, 20, 25, 30, 40, 100],
  alreadyClaimedToday: false,
  cycleDay: 3,
  learnedToday: false,
  ...over,
});

describe('dailyAction', () => {
  it('offers the claim once something was learned today', () => {
    expect(dailyAction(status({ canClaim: true, learnedToday: true }))).toBe('claim');
  });

  it('says to learn first instead of offering a claim that would fail', () => {
    expect(dailyAction(status())).toBe('learnFirst');
  });

  it('is done for the day once claimed, whatever was learned', () => {
    expect(dailyAction(status({ alreadyClaimedToday: true, learnedToday: true, claimableDay: 3 }))).toBe('claimed');
  });

  it('reads an older server, which sends no learnedToday, by canClaim alone', () => {
    expect(dailyAction(status({ learnedToday: undefined }))).toBe('claimed');
    expect(dailyAction(status({ learnedToday: undefined, canClaim: true }))).toBe('claim');
  });
});

describe('cellState', () => {
  it('marks today while it waits for a lesson, with the days before it done', () => {
    const s = status();
    expect([1, 2, 3, 4, 5].map((d) => cellState(s, d))).toEqual(['claimed', 'claimed', 'claimed', 'today', 'upcoming']);
  });

  it('starts a new cycle with nothing done after day 7', () => {
    const s = status({ claimableDay: 1, cycleDay: 7 });
    expect(cellState(s, 1)).toBe('today');
    expect(cellState(s, 7)).toBe('upcoming');
  });

  it('shows the cycle so far once today is claimed', () => {
    const s = status({ alreadyClaimedToday: true, learnedToday: true, claimableDay: 4, cycleDay: 4 });
    expect([3, 4, 5].map((d) => cellState(s, d))).toEqual(['claimed', 'claimed', 'upcoming']);
  });
});
