/**
 * The streak's arithmetic for what was added with restoring a streak: a run
 * that ends is remembered, `restore` brings it back across the missed days,
 * a Hevalo+ member's second freeze keeps a second day, and the instant a
 * learner's day begins (the end of the offer) is found in any time zone.
 */
import { describe, expect, it } from 'vitest';
import {
  grantFreeze,
  localDate,
  MAX_FREEZES,
  maxFreezesFor,
  PLUS_MAX_FREEZES,
  record,
  recordSession,
  restore,
  settle,
  shiftDate,
  startOfLocalDay,
  EMPTY_TALLY,
  type LearningTally,
  type StreakState,
} from './streak-logic.js';

const fresh: StreakState = { currentStreak: 0, longestStreak: 0, lastActiveOn: null, freezes: 0 };

/** A run of `n` days ending on `last`. */
function run(n: number, last: string): StreakState {
  let s = fresh;
  for (let i = n - 1; i >= 0; i--) s = record(s, shiftDate(last, -i)).state;
  return s;
}

describe('a run that ends', () => {
  it('is remembered with its length and its last day', () => {
    const s = settle(run(12, '2026-11-03'), '2026-11-05');
    expect(s.currentStreak).toBe(0);
    expect(s.lastActiveOn).toBe('2026-11-03');
    expect(s.ended).toEqual({ days: 12, lastActiveOn: '2026-11-03', restoredOn: null });
  });

  it('is remembered once: settling again the same day or a later one changes nothing', () => {
    const once = settle(run(12, '2026-11-03'), '2026-11-05');
    expect(settle(once, '2026-11-05')).toEqual(once);
    expect(settle(once, '2026-11-20')).toEqual(once);
  });

  it('stays remembered when a new run begins', () => {
    const broken = settle(run(12, '2026-11-03'), '2026-11-05');
    const again = record(broken, '2026-11-05').state;
    expect(again.currentStreak).toBe(1);
    expect(again.ended).toEqual({ days: 12, lastActiveOn: '2026-11-03', restoredOn: null });
  });

  it('does not spend a freeze on a run that has ended already', () => {
    // ended with no freeze held; one earned afterwards must not be burnt keeping nothing
    const broken = settle(run(5, '2026-11-03'), '2026-11-05');
    const later = settle(grantFreeze(broken), '2026-11-05');
    expect(later.freezes).toBe(1);
    expect(later.freezeUsedOn ?? null).toBeNull();
    expect(later.lastActiveOn).toBe('2026-11-03');
  });

  it('a short run that ends while the earlier one can still be restored joins it', () => {
    // 12 days to the 3rd; the 4th missed; a lesson on the 5th; the 6th missed; seen on the 7th
    let s = settle(run(12, '2026-11-03'), '2026-11-05');
    s = record(s, '2026-11-05').state;
    s = settle(s, '2026-11-07');
    expect(s.currentStreak).toBe(0);
    // the day learned since is added, and the offer still ends when it always would have
    expect(s.ended).toEqual({ days: 13, lastActiveOn: '2026-11-03', restoredOn: null });
  });

  it('replaces the earlier one once its days have passed', () => {
    let s = settle(run(12, '2026-11-03'), '2026-11-05');
    s = record(s, '2026-11-05').state;
    s = record(s, '2026-11-06').state;
    s = settle(s, '2026-11-08'); // the 7th missed; the first offer ended with the 7th
    expect(s.ended).toEqual({ days: 2, lastActiveOn: '2026-11-06', restoredOn: null });
  });

  it('replaces one that was restored', () => {
    let s = restore(run(12, '2026-11-03'), '2026-11-05');
    s = settle(s, '2026-11-07'); // nothing learned on the 5th or the 6th
    expect(s.ended).toEqual({ days: 12, lastActiveOn: '2026-11-04', restoredOn: null });
  });
});

describe('restore', () => {
  it('brings the count back, anchored to yesterday, with nothing learned since', () => {
    const s = restore(run(12, '2026-11-03'), '2026-11-06');
    expect(s.currentStreak).toBe(12);
    expect(s.lastActiveOn).toBe('2026-11-05');
    expect(s.ended).toEqual({ days: 12, lastActiveOn: '2026-11-03', restoredOn: '2026-11-06' });
  });

  it('goes on with the next lesson as if the missed days had been kept', () => {
    const restored = restore(run(12, '2026-11-03'), '2026-11-06');
    expect(record(restored, '2026-11-06').state.currentStreak).toBe(13);
    // it has today to be learned on, as a streak whose last day was yesterday always has
    expect(settle(restored, '2026-11-06').currentStreak).toBe(12);
    // and ends again without it: a restore keeps the days that were missed, not the ones still to come
    const again = settle(restored, '2026-11-07');
    expect(again.currentStreak).toBe(0);
    expect(again.ended).toEqual({ days: 12, lastActiveOn: '2026-11-05', restoredOn: null });
  });

  it('keeps a day learned after the break: the new run is added and its anchor kept', () => {
    let s = settle(run(12, '2026-11-03'), '2026-11-05');
    s = record(s, '2026-11-05').state; // learned today, before restoring
    const restored = restore(s, '2026-11-05');
    expect(restored.currentStreak).toBe(13);
    expect(restored.lastActiveOn).toBe('2026-11-05');
    // today is counted already, so another lesson today adds nothing and tomorrow's makes 14
    expect(record(restored, '2026-11-05').incremented).toBe(false);
    expect(record(restored, '2026-11-06').state.currentStreak).toBe(14);
  });

  it('keeps the days of a short run that ended again before the restore', () => {
    let s = settle(run(12, '2026-11-03'), '2026-11-05');
    s = record(s, '2026-11-05').state;
    const restored = restore(s, '2026-11-07');
    expect(restored.currentStreak).toBe(13);
    expect(restored.lastActiveOn).toBe('2026-11-06');
  });

  it('raises the longest run when the restored one passes it', () => {
    let s = settle(run(12, '2026-11-03'), '2026-11-05');
    expect(s.longestStreak).toBe(12);
    s = record(s, '2026-11-05').state;
    expect(restore(s, '2026-11-05').longestStreak).toBe(13);
  });

  it('spends no freeze', () => {
    // a freeze could not cover two missed days, so it is still held when the run ends
    const s = grantFreeze(run(12, '2026-11-03'));
    expect(restore(s, '2026-11-06').freezes).toBe(1);
  });

  it('leaves a state with nothing ended as it is', () => {
    const s = run(4, '2026-11-03');
    expect(restore(s, '2026-11-04')).toEqual(s);
  });
});

describe('a second freeze (Hevalo+)', () => {
  type Both = { streak: StreakState; tally: LearningTally };

  it('has room for one freeze, and two for a member', () => {
    expect(maxFreezesFor(false)).toBe(MAX_FREEZES);
    expect(maxFreezesFor(true)).toBe(PLUS_MAX_FREEZES);
    expect(PLUS_MAX_FREEZES).toBe(2);
  });

  it('is granted only while there is room, and never taken away', () => {
    const two = grantFreeze(grantFreeze(fresh, PLUS_MAX_FREEZES), PLUS_MAX_FREEZES);
    expect(two.freezes).toBe(2);
    expect(grantFreeze(two, PLUS_MAX_FREEZES).freezes).toBe(2);
    // membership ended with two held: nothing more is earned, and nothing is lost
    expect(grantFreeze(two, MAX_FREEZES).freezes).toBe(2);
  });

  it('is earned by the tenth session, where one freeze is the most without it', () => {
    const sessions = (max: number): Both => {
      let s: Both = { streak: fresh, tally: EMPTY_TALLY };
      for (let i = 0; i < 10; i++) s = recordSession(s.streak, s.tally, shiftDate('2026-07-01', i), max);
      return s;
    };
    expect(sessions(MAX_FREEZES).streak.freezes).toBe(1);
    expect(sessions(PLUS_MAX_FREEZES).streak.freezes).toBe(2);
  });

  it('keeps two missed days in a row, and says both were kept', () => {
    let s = run(6, '2026-07-08');
    s = grantFreeze(grantFreeze(s, 2), 2);
    const kept = settle(s, '2026-07-11'); // the 9th and the 10th missed
    expect(kept).toMatchObject({ currentStreak: 6, freezes: 0, lastActiveOn: '2026-07-10', freezeUsedOn: '2026-07-10', freezeUsedDays: 2 });
    expect(kept.ended ?? null).toBeNull();
  });

  it('counts the days kept in a row when the freezes are spent a day at a time', () => {
    let s = run(6, '2026-07-08');
    s = grantFreeze(grantFreeze(s, 2), 2);
    s = settle(s, '2026-07-10');
    expect(s).toMatchObject({ freezes: 1, freezeUsedOn: '2026-07-09', freezeUsedDays: 1 });
    s = settle(s, '2026-07-11');
    expect(s).toMatchObject({ currentStreak: 6, freezes: 0, freezeUsedOn: '2026-07-10', freezeUsedDays: 2 });
  });

  it('starts the count of kept days again after a day learned between them', () => {
    let s = run(6, '2026-07-08');
    s = grantFreeze(grantFreeze(s, 2), 2);
    s = record(s, '2026-07-10').state; // the 9th kept, the 10th learned
    s = settle(s, '2026-07-12'); // the 11th kept
    expect(s).toMatchObject({ currentStreak: 7, freezes: 0, freezeUsedOn: '2026-07-11', freezeUsedDays: 1 });
  });

  it('ends the run when three days are missed, both freezes still held', () => {
    let s = run(6, '2026-07-08');
    s = grantFreeze(grantFreeze(s, 2), 2);
    const ended = settle(s, '2026-07-12');
    expect(ended).toMatchObject({ currentStreak: 0, freezes: 2 });
    expect(ended.ended).toEqual({ days: 6, lastActiveOn: '2026-07-08', restoredOn: null });
  });
});

describe('startOfLocalDay', () => {
  it('is midnight UTC for UTC, and for a zone nobody has heard of', () => {
    expect(startOfLocalDay('2026-11-08', 'UTC').toISOString()).toBe('2026-11-08T00:00:00.000Z');
    expect(startOfLocalDay('2026-11-08', 'Mars/Olympus').toISOString()).toBe('2026-11-08T00:00:00.000Z');
  });

  it('follows the zone’s offset, in winter and in summer', () => {
    expect(startOfLocalDay('2026-01-15', 'Europe/Berlin').toISOString()).toBe('2026-01-14T23:00:00.000Z');
    expect(startOfLocalDay('2026-07-15', 'Europe/Berlin').toISOString()).toBe('2026-07-14T22:00:00.000Z');
    expect(startOfLocalDay('2026-07-15', 'Asia/Baghdad').toISOString()).toBe('2026-07-14T21:00:00.000Z');
    expect(startOfLocalDay('2026-07-15', 'America/Los_Angeles').toISOString()).toBe('2026-07-15T07:00:00.000Z');
  });

  it('is the first minute of the day everywhere, the days clocks change included', () => {
    const zones = ['Pacific/Kiritimati', 'Etc/GMT+12', 'Asia/Kathmandu', 'America/Santiago', 'Europe/Berlin', 'Australia/Lord_Howe', 'America/St_Johns'];
    const days = ['2026-03-29', '2026-04-05', '2026-09-06', '2026-10-25', '2026-12-31'];
    for (const zone of zones) {
      for (const day of days) {
        const start = startOfLocalDay(day, zone);
        expect(localDate(start, zone), `${zone} ${day}`).toBe(day);
        expect(localDate(new Date(start.getTime() - 60_000), zone), `${zone} ${day}`).toBe(shiftDate(day, -1));
      }
    }
  });
});
