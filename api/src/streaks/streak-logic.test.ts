import { describe, expect, it } from 'vitest';
import {
  countsAsLearning,
  dayDiff,
  EMPTY_TALLY,
  grantFreeze,
  localDate,
  MAX_FREEZES,
  record,
  recordSession,
  SESSIONS_PER_FREEZE,
  settle,
  shiftDate,
  type LearningTally,
  type StreakState,
} from './streak-logic.js';

const fresh: StreakState = { currentStreak: 0, longestStreak: 0, lastActiveOn: null, freezes: 0 };

describe('localDate', () => {
  it('uses the calendar date in the given timezone', () => {
    // 23:30 UTC on the 1st is already the 2nd in Berlin (+1/+2)
    const t = new Date('2026-03-01T23:30:00Z');
    expect(localDate(t, 'Europe/Berlin')).toBe('2026-03-02');
    expect(localDate(t, 'UTC')).toBe('2026-03-01');
    // ...and still the 1st in New York (-5)
    expect(localDate(t, 'America/New_York')).toBe('2026-03-01');
  });

  it('is DST-immune: the day boundary is calendar, not clock', () => {
    // Europe spring-forward night 2026-03-29; 00:30 local is still the 29th
    const t = new Date('2026-03-29T01:30:00+02:00'); // after the skip
    expect(localDate(t, 'Europe/Berlin')).toBe('2026-03-29');
  });
});

describe('dayDiff / shiftDate', () => {
  it('counts whole calendar days across a DST boundary', () => {
    // 25/26/27 October 2026 spans the autumn fall-back; still 1 day each
    expect(dayDiff('2026-10-25', '2026-10-26')).toBe(1);
    expect(dayDiff('2026-10-24', '2026-10-27')).toBe(3);
  });

  it('shifts by whole days', () => {
    expect(shiftDate('2026-03-02', -1)).toBe('2026-03-01');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('record', () => {
  it('starts a streak at 1 on first activity', () => {
    const { state, incremented } = record(fresh, '2026-07-08');
    expect(state.currentStreak).toBe(1);
    expect(state.longestStreak).toBe(1);
    expect(incremented).toBe(true);
  });

  it('does not double-count the same day', () => {
    const once = record(fresh, '2026-07-08').state;
    const again = record(once, '2026-07-08');
    expect(again.incremented).toBe(false);
    expect(again.state.currentStreak).toBe(1);
  });

  it('extends on a consecutive day', () => {
    let s = record(fresh, '2026-07-08').state;
    s = record(s, '2026-07-09').state;
    s = record(s, '2026-07-10').state;
    expect(s.currentStreak).toBe(3);
    expect(s.longestStreak).toBe(3);
  });

  it('resets to 1 after a missed day with no freeze', () => {
    let s = record(fresh, '2026-07-08').state; // 1
    s = record(s, '2026-07-09').state; // 2
    // skip the 10th entirely, next activity on the 11th
    s = record(s, '2026-07-11').state;
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(2); // best is remembered
  });

  it('keeps the best streak as longest after a reset', () => {
    let s = record(fresh, '2026-07-01').state;
    for (const d of ['2026-07-02', '2026-07-03', '2026-07-04']) s = record(s, d).state;
    expect(s.longestStreak).toBe(4);
    s = record(s, '2026-07-10').state; // big gap → reset
    expect(s.currentStreak).toBe(1);
    expect(s.longestStreak).toBe(4);
  });
});

describe('freeze', () => {
  it('caps stored freezes at 1', () => {
    let s = grantFreeze(fresh);
    s = grantFreeze(s);
    expect(s.freezes).toBe(1);
  });

  it('auto-consumes a freeze to cover one missed day, preserving the run', () => {
    let s = record(fresh, '2026-07-08').state; // streak 1
    s = record(s, '2026-07-09').state; // streak 2
    s = grantFreeze(s); // bank a freeze
    // miss the 10th; act on the 11th → freeze covers the 10th
    s = record(s, '2026-07-11').state;
    expect(s.currentStreak).toBe(3);
    expect(s.freezes).toBe(0);
  });

  it('a single freeze cannot cover two missed days', () => {
    let s = record(fresh, '2026-07-08').state; // 1
    s = grantFreeze(s);
    // miss the 9th and 10th; act on the 11th
    s = record(s, '2026-07-11').state;
    expect(s.currentStreak).toBe(1); // reset
    expect(s.freezes).toBe(1); // freeze kept (couldn't save the run)
  });
});

describe('settle (read-time)', () => {
  it('leaves a same-day or next-day state untouched', () => {
    const s = record(fresh, '2026-07-08').state;
    expect(settle(s, '2026-07-08').currentStreak).toBe(1);
    expect(settle(s, '2026-07-09').currentStreak).toBe(1); // yesterday, still alive
  });

  it('zeroes a lapsed run on read', () => {
    const s = record(fresh, '2026-07-08').state;
    // two days later with no activity and no freeze
    expect(settle(s, '2026-07-10').currentStreak).toBe(0);
  });

  it('burns a freeze on read when a covered day has passed', () => {
    let s = record(fresh, '2026-07-08').state;
    s = grantFreeze(s);
    const settled = settle(s, '2026-07-10'); // one missed day (the 9th)
    expect(settled.currentStreak).toBe(1); // preserved
    expect(settled.freezes).toBe(0); // consumed
    expect(settled.lastActiveOn).toBe('2026-07-09'); // anchor advanced
  });

  it('is idempotent for a given day', () => {
    let s = record(fresh, '2026-07-08').state;
    s = grantFreeze(s);
    const a = settle(s, '2026-07-10');
    const b = settle(a, '2026-07-10');
    expect(b).toEqual(a);
  });
});

describe('recordSession (days learned and earned freezes)', () => {
  type Both = { streak: StreakState; tally: LearningTally };
  /** One session a day for `n` consecutive days from 2026-07-01. */
  const sessions = (n: number): Both => {
    let s: Both = { streak: fresh, tally: EMPTY_TALLY };
    for (let i = 0; i < n; i++) s = recordSession(s.streak, s.tally, shiftDate('2026-07-01', i));
    return s;
  };

  it('counts each day learned once, however many sessions it had', () => {
    let s: Both = { streak: fresh, tally: EMPTY_TALLY };
    for (let i = 0; i < 3; i++) s = recordSession(s.streak, s.tally, '2026-07-01');
    s = recordSession(s.streak, s.tally, '2026-07-02');
    expect(s.tally.daysLearned).toBe(2);
    expect(s.tally.lastLearnedOn).toBe('2026-07-02');
    expect(s.streak.currentStreak).toBe(2);
  });

  it('keeps counting days learned through a broken streak', () => {
    let s = sessions(3);
    s = recordSession(s.streak, s.tally, '2026-07-20');
    expect(s.streak.currentStreak).toBe(1);
    expect(s.streak.longestStreak).toBe(3);
    expect(s.tally.daysLearned).toBe(4);
  });

  it('earns a freeze on every fifth session', () => {
    let s = sessions(4);
    expect(s.streak.freezes).toBe(0);
    expect(s.tally.freezeProgress).toBe(4);
    const fifth = recordSession(s.streak, s.tally, '2026-07-05');
    expect(fifth.freezeEarned).toBe(true);
    expect(fifth.streak.freezes).toBe(1);
    expect(fifth.tally.freezeProgress).toBe(0);
    s = fifth;
    expect(s.streak.currentStreak).toBe(5);
  });

  it('holds a full count at the cap and pays it once a freeze is spent', () => {
    // a freeze at session 5; sessions 6–10 fill the count to the top
    const full = sessions(10);
    expect(full.streak.freezes).toBe(MAX_FREEZES);
    expect(full.tally.freezeProgress).toBe(SESSIONS_PER_FREEZE);

    const extra = recordSession(full.streak, full.tally, '2026-07-10');
    expect(extra.freezeEarned).toBe(false);
    expect(extra.streak.freezes).toBe(MAX_FREEZES);

    // miss the 11th: the freeze covers it, and the next session earns it back
    const back = recordSession(extra.streak, extra.tally, '2026-07-12');
    expect(back.streak.currentStreak).toBe(11);
    expect(back.freezeEarned).toBe(true);
    expect(back.streak.freezes).toBe(MAX_FREEZES);
    expect(back.tally.freezeProgress).toBe(0);
  });
});

describe('countsAsLearning', () => {
  it('never counts a session with nothing answered', () => {
    expect(countsAsLearning(0, 10)).toBe(false);
    expect(countsAsLearning(0, 1)).toBe(false);
    // not even an empty one: there was nothing to learn from
    expect(countsAsLearning(0, 0)).toBe(false);
  });

  it('needs at least half of the items answered', () => {
    expect(countsAsLearning(4, 10)).toBe(false);
    expect(countsAsLearning(5, 10)).toBe(true);
    // odd totals round the half up
    expect(countsAsLearning(1, 3)).toBe(false);
    expect(countsAsLearning(2, 3)).toBe(true);
    expect(countsAsLearning(1, 1)).toBe(true);
    expect(countsAsLearning(10, 10)).toBe(true);
  });
});
