import { describe, expect, it } from 'vitest';
import { formatMinute, quietEnabled, stepMinute, type NotificationPrefs } from './prefs.js';

describe('formatMinute', () => {
  it('formats minute-of-day as HH:MM', () => {
    expect(formatMinute(0)).toBe('00:00');
    expect(formatMinute(9 * 60 + 5)).toBe('09:05');
    expect(formatMinute(22 * 60)).toBe('22:00');
  });
});

describe('stepMinute', () => {
  it('steps by 30 and wraps within a day', () => {
    expect(stepMinute(9 * 60, 1)).toBe(9 * 60 + 30);
    expect(stepMinute(23 * 60 + 30, 1)).toBe(0); // wraps midnight
    expect(stepMinute(0, -1)).toBe(23 * 60 + 30); // wraps back
  });
});

describe('quietEnabled', () => {
  it('is true only when both bounds are set', () => {
    const base: NotificationPrefs = {
      streak: true, friends: true, games: true, events: true, marketing: false,
      quietStartMin: null, quietEndMin: null,
    };
    expect(quietEnabled(base)).toBe(false);
    expect(quietEnabled({ ...base, quietStartMin: 1320, quietEndMin: 420 })).toBe(true);
  });
});
