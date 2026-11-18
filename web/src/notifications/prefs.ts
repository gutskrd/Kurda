/**
 * Pure notification-preference helpers, with the same shapes as `mobile/src/notifications/prefs.ts`. The phone steps
 * quiet hours by half-hours, while the browser uses `<input type="time">`, hence `parseMinute` here.
 */
import type { MessageKey } from '../i18n/en';

export const NOTIFICATION_CATEGORIES = ['streak', 'friends', 'letters', 'games', 'progress', 'events', 'marketing'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Each category's label, typed as `MessageKey` so a missing key fails to compile rather than rendering raw. `marketing`
 * reads as news and offers, and is the explicit opt-in that defaults to off.
 */
export const CATEGORY_LABEL: Record<NotificationCategory, MessageKey> = {
  streak: 'notifications.pref.streak',
  friends: 'notifications.pref.friends',
  // Letters have their own switch, separate from friends' news.
  letters: 'notifications.pref.letters',
  games: 'notifications.pref.games',
  // League and badge news; the server turns it off by default for a teen.
  progress: 'notifications.pref.progress',
  events: 'notifications.pref.events',
  marketing: 'notifications.pref.news',
};

export interface NotificationPrefs {
  streak: boolean;
  friends: boolean;
  /** Letters from pen pals; until chosen, the server makes it match `friends`. */
  letters: boolean;
  games: boolean;
  /** League and badge news. */
  progress: boolean;
  events: boolean;
  marketing: boolean;
  /** minutes-of-day [0,1440); null/null means no quiet hours. May wrap midnight. */
  quietStartMin: number | null;
  quietEndMin: number | null;
}

/** Quiet hours are on only when both ends are set, as on the server. */
export function quietEnabled(prefs: NotificationPrefs): boolean {
  return prefs.quietStartMin !== null && prefs.quietEndMin !== null;
}

/** "HH:MM" for a minute-of-day, which is also a time input's format. */
export function formatMinute(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * A minute-of-day from a time input's "HH:MM", or null when it is not one, such as the `''` of a cleared or half-typed
 * field, so a `NaN` never reaches the server.
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
interface QuietPatch {
  quietStartMin: number | null;
  quietEndMin: number | null;
}

/**
 * Quiet hours resolved for `PUT /me/notification-prefs`, which refuses a half-set pair. Turning them on with nothing
 * typed fills in the default window.
 */
export function quietPatch(enabled: boolean, start: number | null, end: number | null): QuietPatch {
  if (!enabled) return { quietStartMin: null, quietEndMin: null };
  return {
    quietStartMin: start ?? DEFAULT_QUIET_START,
    quietEndMin: end ?? DEFAULT_QUIET_END,
  };
}

/** The default window, 22:00–07:00. */
export const DEFAULT_QUIET_START = 22 * 60;
export const DEFAULT_QUIET_END = 7 * 60;
