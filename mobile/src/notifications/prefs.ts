/** Pure notification-preference view helpers (KUR-095) — no React Native. */

import type { TranslationKey } from '../i18n/translations.js';

export const NOTIFICATION_CATEGORIES = ['streak', 'friends', 'letters', 'games', 'events', 'progress', 'marketing'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * TranslationKey, not string. These were keys typed as strings, and the screen
 * printed them straight out: users read the literal words
 * notifications.pref.streak on the settings screen, in all nine languages,
 * because a key drops into a string slot without the compiler saying a word.
 * The type is what stops it happening again.
 */
export const CATEGORY_LABEL: Record<NotificationCategory, TranslationKey> = {
  streak: 'notifications.pref.streak',
  friends: 'notifications.pref.friends',
  // letters by bird have their own switch: somebody writing to you is not the same as a friend's news
  letters: 'notifications.pref.letters',
  games: 'notifications.pref.games',
  events: 'notifications.pref.events',
  progress: 'notifications.pref.progress',
  marketing: 'notifications.pref.news',
};

export interface NotificationPrefs {
  streak: boolean;
  friends: boolean;
  /** a pen pal's bird at the window, your own home with an answer; as `friends` is until it is chosen (the server's rule) */
  letters: boolean;
  games: boolean;
  events: boolean;
  /** leagues and badges: a promotion, safe this week, a badge earned (off by default for a minor) */
  progress: boolean;
  marketing: boolean;
  quietStartMin: number | null;
  quietEndMin: number | null;
}

// half an hour, which is what the steppers' spoken names say ("start half an hour earlier")
const STEP = 30;

/** "HH:MM" for a minute-of-day. */
export function formatMinute(min: number, locale?: string): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  // in the reader's language, which decides between twelve hours and twenty-four ("10:00 PM", "22:00"), as every other time in the app is
  if (locale) {
    try {
      return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, h, m));
    } catch {
      // a language the phone has no data for: the clock as the day writes it, below
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
