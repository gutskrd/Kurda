/** Pure notification-preference view helpers (KUR-095) — no React Native. */

import type { TranslationKey } from '../i18n/translations.js';

export const NOTIFICATION_CATEGORIES = ['streak', 'friends', 'games', 'events', 'marketing'] as const;
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
  games: 'notifications.pref.games',
  events: 'notifications.pref.events',
  marketing: 'notifications.pref.news',
};

export interface NotificationPrefs {
  streak: boolean;
  friends: boolean;
  games: boolean;
  events: boolean;
  marketing: boolean;
  quietStartMin: number | null;
  quietEndMin: number | null;
}

const STEP = 30;

/** "HH:MM" for a minute-of-day. */
export function formatMinute(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Step a minute-of-day by ±30, wrapping within a day. */
export function stepMinute(min: number, dir: 1 | -1): number {
  return (((min + dir * STEP) % 1440) + 1440) % 1440;
}

export function quietEnabled(prefs: NotificationPrefs): boolean {
  return prefs.quietStartMin !== null && prefs.quietEndMin !== null;
}
