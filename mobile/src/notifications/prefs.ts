/** Pure notification-preference view helpers, with no React Native. */

import type { TranslationKey } from '../i18n/translations.js';

export const NOTIFICATION_CATEGORIES = ['streak', 'friends', 'letters', 'games', 'events', 'progress', 'marketing'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Typed as TranslationKey, not string, so a key cannot be printed untranslated. */
export const CATEGORY_LABEL: Record<NotificationCategory, TranslationKey> = {
  streak: 'notifications.pref.streak',
  friends: 'notifications.pref.friends',
  // Letters by bird have their own switch: somebody writing to you is not a friend's news.
  letters: 'notifications.pref.letters',
  games: 'notifications.pref.games',
  events: 'notifications.pref.events',
  progress: 'notifications.pref.progress',
  marketing: 'notifications.pref.news',
};

export interface NotificationPrefs {
  streak: boolean;
  friends: boolean;
  /**
   * A pen pal's bird at the window, or your own home with an answer; follows `friends` until chosen (the server's
   * rule).
   */
  letters: boolean;
  games: boolean;
  events: boolean;
  /** Leagues and badges: a promotion, safe this week, a badge earned (off by default for a minor). */
  progress: boolean;
  marketing: boolean;
  quietStartMin: number | null;
  quietEndMin: number | null;
}

// Half an hour, which is what the steppers' spoken names say ("start half an hour earlier").
const STEP = 30;

/** "HH:MM" for a minute-of-day. */
export function formatMinute(min: number, locale?: string): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  // In the reader's language, which decides between twelve and twenty-four hours ("10:00 PM", "22:00"), as every time
  // in the app is.
  if (locale) {
    try {
      return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
    } catch {
      // A language the phone has no data for: the clock as below.
    }
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Step a minute-of-day by ±30, wrapping within a day. */
export function stepMinute(min: number, dir: 1 | -1): number {
  return (((min + dir * STEP) % 1440) + 1440) % 1440;
}

export function quietEnabled(prefs: NotificationPrefs): boolean {
  return prefs.quietStartMin !== null && prefs.quietEndMin !== null;
}
