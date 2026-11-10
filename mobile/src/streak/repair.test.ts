import { describe, expect, it } from 'vitest';
import { gemsShort, repairLastDay, repairRefusal } from './repair';

describe('restoring a streak, as the sheet reads it', () => {
  it('names the last day by a moment inside it, not the instant after it', () => {
    // the offer ends as the 12th begins: the last day is the 11th
    expect(repairLastDay({ until: '2026-11-12T00:00:00.000Z' })!.toISOString()).toBe('2026-11-11T23:59:00.000Z');
    expect(repairLastDay({ until: 'not a date' })).toBeNull();
  });

  it('says the gems are short only when it knows they are', () => {
    const paid = { costGems: 50, free: false };
    expect(gemsShort(paid, 49)).toBe(true);
    expect(gemsShort(paid, 0)).toBe(true);
    expect(gemsShort(paid, 50)).toBe(false);
    // not read yet: the button stays live and the server answers
    expect(gemsShort(paid, null)).toBe(false);
  });

  it('never calls a free restore short', () => {
    expect(gemsShort({ costGems: 0, free: true }, 0)).toBe(false);
    expect(gemsShort({ costGems: 0, free: true }, null)).toBe(false);
  });

  it('reads a refusal as gems short, the offer gone, or something else', () => {
    expect(repairRefusal('INSUFFICIENT_FUNDS')).toBe('short');
    for (const code of ['NOTHING_TO_RESTORE', 'RESTORE_EXPIRED', 'STREAK_TOO_SHORT']) expect(repairRefusal(code)).toBe('gone');
    expect(repairRefusal('REWARDS_PAUSED')).toBe('other');
    expect(repairRefusal(undefined)).toBe('other');
  });
});
