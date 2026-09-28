import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABEL,
  DEFAULT_QUIET_END,
  DEFAULT_QUIET_START,
  NOTIFICATION_CATEGORIES,
  formatMinute,
  parseMinute,
  quietEnabled,
  quietPatch,
  type NotificationPrefs,
} from './prefs';
import { en } from '../i18n/en';

const prefs = (over: Partial<NotificationPrefs> = {}): NotificationPrefs => ({
  streak: true,
  friends: true,
  games: true,
  events: true,
  marketing: false,
  quietStartMin: null,
  quietEndMin: null,
  ...over,
});

describe('CATEGORY_LABEL', () => {
  it('labels every category the server knows', () => {
    for (const c of NOTIFICATION_CATEGORIES) expect(CATEGORY_LABEL[c], c).toBeTruthy();
  });

  /*
   * The failure this table's type exists to prevent: a key with nothing behind
   * it renders as the key, so the settings screen reads
   * "notifications.pref.streak" and typechecks perfectly.
   */
  it('names a key English actually has', () => {
    for (const c of NOTIFICATION_CATEGORIES) {
      expect(en[CATEGORY_LABEL[c]], `${c} → ${CATEGORY_LABEL[c]}`).toBeTruthy();
    }
  });

  it('gives each category its own label', () => {
    const labels = NOTIFICATION_CATEGORIES.map((c) => CATEGORY_LABEL[c]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('quietEnabled', () => {
  it('is on only when both ends are set', () => {
    expect(quietEnabled(prefs())).toBe(false);
    expect(quietEnabled(prefs({ quietStartMin: 1320, quietEndMin: 420 }))).toBe(true);
  });

  /* a half-set pair is not "on": the server would refuse to store it */
  it('is off when only one end is set', () => {
    expect(quietEnabled(prefs({ quietStartMin: 1320 }))).toBe(false);
    expect(quietEnabled(prefs({ quietEndMin: 420 }))).toBe(false);
  });
});

describe('formatMinute', () => {
  it('pads to HH:MM, which is what a time input wants', () => {
    expect(formatMinute(0)).toBe('00:00');
    expect(formatMinute(7 * 60)).toBe('07:00');
    expect(formatMinute(22 * 60 + 30)).toBe('22:30');
    expect(formatMinute(1439)).toBe('23:59');
  });
});

describe('parseMinute', () => {
  it('reads what a time input writes', () => {
    expect(parseMinute('00:00')).toBe(0);
    expect(parseMinute('07:00')).toBe(420);
    expect(parseMinute('23:59')).toBe(1439);
    expect(parseMinute('7:05')).toBe(425);
  });

  /*
   * A time input hands back '' the moment it is cleared, and the value is user
   * input either way. Returning null keeps a NaN from travelling to the server
   * as a minute-of-day.
   */
  it('refuses anything that is not a time', () => {
    for (const bad of ['', '  ', '7', '07:5', 'ab:cd', '24:00', '12:60', '-1:00', '07:00:00']) {
      expect(parseMinute(bad), bad).toBeNull();
    }
  });

  it('round-trips with formatMinute across the whole day', () => {
    for (let m = 0; m < 1440; m += 7) expect(parseMinute(formatMinute(m)), String(m)).toBe(m);
  });
});

describe('quietPatch', () => {
  it('clears both ends when switched off', () => {
    expect(quietPatch(false, 1320, 420)).toEqual({ quietStartMin: null, quietEndMin: null });
  });

  it('keeps what is already chosen when switched on', () => {
    expect(quietPatch(true, 1320, 420)).toEqual({ quietStartMin: 1320, quietEndMin: 420 });
  });

  /**
   * The case the server's `refine` rejects: switched on with nothing typed yet.
   * Sending one end and not the other is a 422, which a reader experiences as a
   * broken switch rather than as a validation rule.
   */
  it('never sends half a pair', () => {
    for (const [s, e] of [
      [null, null],
      [1320, null],
      [null, 420],
    ] as Array<[number | null, number | null]>) {
      const patch = quietPatch(true, s, e);
      expect(typeof patch.quietStartMin, `${s}/${e}`).toBe('number');
      expect(typeof patch.quietEndMin, `${s}/${e}`).toBe('number');
    }
  });

  it('falls back to a window somebody would actually mean', () => {
    expect(quietPatch(true, null, null)).toEqual({
      quietStartMin: DEFAULT_QUIET_START,
      quietEndMin: DEFAULT_QUIET_END,
    });
    expect(formatMinute(DEFAULT_QUIET_START)).toBe('22:00');
    expect(formatMinute(DEFAULT_QUIET_END)).toBe('07:00');
  });
});
