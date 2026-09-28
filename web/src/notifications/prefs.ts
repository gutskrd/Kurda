/**
 * Pure notification-preference helpers (KUR-095) — no React.
 *
 * The browser had no way to change any of this: `GET`/`PUT /me/notification-prefs`
 * went uncalled, so a reader who signed up in a browser could not turn a category
 * off or set quiet hours without installing the app.
 *
 * Written against the same shapes as `mobile/src/notifications/prefs.ts`, minus
 * its `stepMinute` — the phone nudges quiet hours in half-hours with two
 * buttons, and a browser has `<input type="time">`, which is better at this than
 * anything worth building. Which is why `parseMinute` exists here and not there.
 */
import type { MessageKey } from '../i18n/en';

export const NOTIFICATION_CATEGORIES = ['streak', 'friends', 'games', 'events', 'marketing'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * `MessageKey`, not string.
 *
 * The phone's copy of this table records why: these were once typed as strings
 * and the screen printed them straight out, so people read the literal words
 * `notifications.pref.streak` in their settings, in all nine languages, because
 * a key drops into a string slot without the compiler saying a word.
 *
 * `marketing` reads as news and offers, which is what the category is for, and
 * is the one that defaults to off — the server treats it as explicit opt-in.
 */
export const CATEGORY_LABEL: Record<NotificationCategory, MessageKey> = {
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
  /** minutes-of-day [0,1440); null/null means no quiet hours. May wrap midnight. */
  quietStartMin: number | null;
  quietEndMin: number | null;
}

/** Quiet hours are on only when both ends are set — the server's rule. */
export function quietEnabled(prefs: NotificationPrefs): boolean {
  return prefs.quietStartMin !== null && prefs.quietEndMin !== null;
}

/** "HH:MM" for a minute-of-day, which is also what a time input wants. */
export function formatMinute(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * A minute-of-day from a time input's "HH:MM", or null if it is not one.
 *
 * A time input hands back `''` whenever it is cleared or half-typed, and the
 * field is user input besides, so this refuses anything it cannot read rather
 * than returning a `NaN` that would travel all the way to the server.
 */
export function parseMinute(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Quiet hours as the server will accept them: both ends, or neither. */
export interface QuietPatch {
  quietStartMin: number | null;
  quietEndMin: number | null;
}

/**
 * The pair, resolved.
 *
 * `PUT /me/notification-prefs` refuses a half-set pair — its schema has a
 * `refine` saying both or neither — and a 422 from a settings toggle reads to
 * the person as "the switch is broken". Turning quiet hours on with nothing
 * typed yet is the ordinary way to arrive at that half state, so this fills in
 * the default window rather than sending something that cannot be accepted.
 */
export function quietPatch(enabled: boolean, start: number | null, end: number | null): QuietPatch {
  if (!enabled) return { quietStartMin: null, quietEndMin: null };
  return {
    quietStartMin: start ?? DEFAULT_QUIET_START,
    quietEndMin: end ?? DEFAULT_QUIET_END,
  };
}

/** 22:00–07:00, the window somebody switching this on almost certainly means. */
export const DEFAULT_QUIET_START = 22 * 60;
export const DEFAULT_QUIET_END = 7 * 60;
