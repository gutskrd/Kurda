import { describe, expect, it } from 'vitest';
import type { Streak } from './format';
import { freezeSlots, keptKey, keptTitle, nextFreeze, streakKept } from './kept';

const kept: Streak = {
  current: 6,
  longest: 9,
  freezes: 0,
  maxFreezes: 1,
  lastActiveOn: '2026-10-27',
  freezeUsedOn: '2026-10-27',
  freezeProgress: 3,
  sessionsPerFreeze: 5,
};

describe('streakKept', () => {
  it('says a freeze spent on a day this phone has not said yet', () => {
    expect(streakKept(kept, null)).toBe(true);
    expect(streakKept(kept, '2026-09-02')).toBe(true);
  });

  it('says each kept day once', () => {
    expect(streakKept(kept, '2026-10-27')).toBe(false);
  });

  it('still says it the day after, when a lesson today came first', () => {
    expect(streakKept({ ...kept, current: 7, lastActiveOn: '2026-10-28' }, null)).toBe(true);
  });

  it('leaves a freeze spent long ago unsaid, as old news', () => {
    expect(streakKept({ ...kept, current: 20, lastActiveOn: '2026-11-10' }, null)).toBe(false);
  });

  it('says nothing with no freeze spent, a broken run, or nothing read yet', () => {
    expect(streakKept({ ...kept, freezeUsedOn: null }, null)).toBe(false);
    expect(streakKept({ ...kept, freezeUsedOn: undefined }, null)).toBe(false);
    expect(streakKept({ ...kept, current: 0 }, null)).toBe(false);
    expect(streakKept(null, null)).toBe(false);
  });
});

describe('what the sheet says', () => {
  it('names the run in the headline, with its own words for a single day', () => {
    expect(keptTitle(kept)).toEqual({ key: 'learn.kept.title', params: { count: 6 } });
    expect(keptTitle({ ...kept, current: 1 })).toEqual({ key: 'learn.kept.titleOne' });
  });

  it('draws the freezes held among the places for them', () => {
    expect(freezeSlots(kept)).toEqual({ held: 0, max: 1 });
    expect(freezeSlots({ ...kept, freezes: 1 })).toEqual({ held: 1, max: 1 });
    // an older response says no maximum: one, as the server allows
    expect(freezeSlots({ ...kept, maxFreezes: undefined, freezes: 3 })).toEqual({ held: 1, max: 1 });
  });

  it('says how many more lessons earn the next freeze', () => {
    expect(nextFreeze(kept)).toEqual({ key: 'learn.kept.earn', params: { count: 2 } });
    expect(nextFreeze({ ...kept, freezeProgress: 4 })).toEqual({ key: 'learn.kept.earnOne' });
    // a count that filled while one was held: the next lesson earns it
    expect(nextFreeze({ ...kept, freezeProgress: 5 })).toEqual({ key: 'learn.kept.earnOne' });
  });

  it('says one is ready when a lesson since has earned it back, and nothing when the server does not say', () => {
    expect(nextFreeze({ ...kept, freezes: 1 })).toEqual({ key: 'learn.kept.ready' });
    expect(nextFreeze({ ...kept, freezeProgress: undefined })).toBeNull();
  });

  it('keeps what was said apart for each account on the phone', () => {
    expect(keptKey('a')).not.toBe(keptKey('b'));
  });
});
