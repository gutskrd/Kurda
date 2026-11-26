import { describe, expect, it } from 'vitest';
import { repairLastDay, repairRefusal, winBackProgress, wonBackToday } from './repair';

describe('winning a streak back, as the sheet reads it', () => {
  it('names the last day by a moment inside it, not the instant after it', () => {
    // The offer ends as the 12th begins: the last day is the 11th.
    expect(repairLastDay({ until: '2026-11-12T00:00:00.000Z' })!.toISOString()).toBe('2026-11-11T23:59:00.000Z');
    expect(repairLastDay({ until: 'not a date' })).toBeNull();
  });

  it('counts today’s sessions toward the three, never past them, and reads an older server as none yet', () => {
    expect(winBackProgress({ sessionsToday: 1, sessionsNeeded: 3 })).toEqual({ done: 1, needed: 3 });
    expect(winBackProgress({ sessionsToday: 5, sessionsNeeded: 3 })).toEqual({ done: 3, needed: 3 });
    expect(winBackProgress({} as never)).toEqual({ done: 0, needed: 3 });
  });

  it('reads a refusal as learning needed, the offer gone, or something else', () => {
    expect(repairRefusal('WIN_IT_BACK')).toBe('learn');
    for (const code of ['NOTHING_TO_RESTORE', 'RESTORE_EXPIRED', 'STREAK_TOO_SHORT']) expect(repairRefusal(code)).toBe('gone');
    expect(repairRefusal('REWARDS_PAUSED')).toBe('other');
    expect(repairRefusal(undefined)).toBe('other');
  });

  it('knows a streak won back today from one won back before', () => {
    expect(wonBackToday({ restored: { days: 12, on: '2026-11-18' } }, '2026-11-18')).toBe(true);
    expect(wonBackToday({ restored: { days: 12, on: '2026-11-17' } }, '2026-11-18')).toBe(false);
    expect(wonBackToday({ restored: null }, '2026-11-18')).toBe(false);
    expect(wonBackToday({}, '2026-11-18')).toBe(false);
  });
});
