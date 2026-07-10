import { describe, expect, it } from 'vitest';
import { countdown, tierMeta, weekEnd, zoneFor } from './format';

describe('tierMeta', () => {
  it('maps known tiers and falls back for unknown', () => {
    expect(tierMeta('gold').label).toBe('Gold');
    expect(tierMeta('mystery').label).toBe('mystery');
  });
});

describe('zoneFor', () => {
  it('marks top promoteCount as promotion and bottom demoteCount as demotion', () => {
    // full cohort of 30, promote 10 / demote 5
    expect(zoneFor(1, 30, 10, 5)).toBe('promotion');
    expect(zoneFor(10, 30, 10, 5)).toBe('promotion');
    expect(zoneFor(11, 30, 10, 5)).toBe('safe');
    expect(zoneFor(26, 30, 10, 5)).toBe('demotion');
    expect(zoneFor(30, 30, 10, 5)).toBe('demotion');
  });
  it('never marks a demotion zone in a small cohort', () => {
    expect(zoneFor(6, 6, 10, 5)).toBe('promotion'); // tiny cohort, all promote-eligible
    expect(zoneFor(6, 8, 3, 3)).toBe('safe'); // <10 total → no demotion zone
  });
});

describe('weekEnd / countdown', () => {
  it('week end is the following Monday 00:00 UTC', () => {
    expect(weekEnd('2026-07-06')).toBe(Date.parse('2026-07-13T00:00:00Z'));
  });
  it('formats the remaining time and handles a closed week', () => {
    const week = '2026-07-06';
    expect(countdown(week, Date.parse('2026-07-11T20:00:00Z'))).toBe('1d 4h');
    expect(countdown(week, Date.parse('2026-07-12T21:30:00Z'))).toBe('2h 30m');
    expect(countdown(week, Date.parse('2026-07-14T00:00:00Z'))).toBe('Ended');
  });
});
