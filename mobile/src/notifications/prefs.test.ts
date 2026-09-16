import { describe, expect, it } from 'vitest';
import { CATEGORY_LABEL, NOTIFICATION_CATEGORIES, formatMinute, quietEnabled, stepMinute, type NotificationPrefs } from './prefs.js';
import { LOCALES, TRANSLATIONS } from '../i18n/translations.js';

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

/**
 * Four of these five labels were shown to users as their own key names —
 * the literal text notifications.pref.streak — because the map held keys but
 * was typed Record<…, string>, and the screen printed it without t(). The
 * fifth held the bare English word Events. The type stops it recurring; this
 * stops a label being added that no language can answer.
 */
describe('notification category labels', () => {
  it('every category resolves to real copy in all nine languages', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      for (const locale of LOCALES) {
        const copy = TRANSLATIONS[locale][CATEGORY_LABEL[category]];
        expect(copy, `${locale}.${category}`).toBeTruthy();
        expect(copy, `${locale}.${category} still reads as its own key`).not.toBe(CATEGORY_LABEL[category]);
      }
    }
  });
});
