import { describe, expect, it } from 'vitest';
import {
  allows,
  defaultPrefs,
  inQuietHours,
  minuteOfDayInTz,
  type NotificationPrefs,
} from './prefs.js';

function prefs(over: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return { ...defaultPrefs(), ...over };
}

describe('defaultPrefs', () => {
  it('enables everything except marketing (GDPR opt-in)', () => {
    const p = defaultPrefs();
    expect(p.marketing).toBe(false);
    expect([p.streak, p.friends, p.games, p.events]).toEqual([true, true, true, true]);
  });
});

describe('minuteOfDayInTz', () => {
  it('converts a UTC instant to local minute-of-day', () => {
    const noonUtc = new Date('2026-03-21T12:00:00.000Z');
    expect(minuteOfDayInTz(noonUtc, 'UTC')).toBe(12 * 60);
    // Berlin is UTC+1 in March (before DST) → 13:00
    expect(minuteOfDayInTz(noonUtc, 'Europe/Berlin')).toBe(13 * 60);
  });
});

describe('inQuietHours', () => {
  it('is false when unset', () => {
    expect(inQuietHours(prefs(), 500)).toBe(false);
  });

  it('handles a same-day window', () => {
    const p = prefs({ quietStartMin: 9 * 60, quietEndMin: 17 * 60 });
    expect(inQuietHours(p, 8 * 60)).toBe(false);
    expect(inQuietHours(p, 12 * 60)).toBe(true);
    expect(inQuietHours(p, 17 * 60)).toBe(false); // end exclusive
  });

  it('handles a window wrapping midnight (22:00–07:00)', () => {
    const p = prefs({ quietStartMin: 22 * 60, quietEndMin: 7 * 60 });
    expect(inQuietHours(p, 23 * 60)).toBe(true);
    expect(inQuietHours(p, 2 * 60)).toBe(true);
    expect(inQuietHours(p, 12 * 60)).toBe(false);
    expect(inQuietHours(p, 7 * 60)).toBe(false); // end exclusive
  });
});

describe('allows', () => {
  it('blocks a disabled category', () => {
    expect(allows(prefs({ marketing: false }), 'marketing', 600)).toBe(false);
    expect(allows(prefs({ games: true }), 'games', 600)).toBe(true);
  });

  it('blocks any category during quiet hours', () => {
    const p = prefs({ quietStartMin: 22 * 60, quietEndMin: 7 * 60 });
    expect(allows(p, 'streak', 23 * 60)).toBe(false);
    expect(allows(p, 'streak', 12 * 60)).toBe(true);
  });
});
