/**
 * Pure notification-preference logic (KUR-095). A push is allowed only if its
 * category is enabled AND the moment isn't inside the user's quiet hours. The
 * gate is evaluated at delivery time (in the worker), so a preference change is
 * honored even for sends already sitting in the queue. Marketing defaults OFF
 * for GDPR — opt-in, never opt-out.
 */

export const NOTIFICATION_CATEGORIES = ['streak', 'friends', 'games', 'events', 'marketing'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationPrefs {
  streak: boolean;
  friends: boolean;
  games: boolean;
  events: boolean;
  marketing: boolean;
  /** Minutes-of-day [0,1440). null/null = no quiet hours. May wrap midnight. */
  quietStartMin: number | null;
  quietEndMin: number | null;
}

export function defaultPrefs(): NotificationPrefs {
  return {
    streak: true,
    friends: true,
    games: true,
    events: true,
    marketing: false, // GDPR: explicit opt-in
    quietStartMin: null,
    quietEndMin: null,
  };
}

/** Minute-of-day [0,1440) at `now` in the given IANA timezone. */
export function minuteOfDayInTz(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return (hour % 24) * 60 + minute;
}

/** Whether `minute` falls in the quiet window, handling a midnight wrap. */
export function inQuietHours(prefs: NotificationPrefs, minute: number): boolean {
  const { quietStartMin: start, quietEndMin: end } = prefs;
  if (start === null || end === null) return false;
  if (start === end) return false; // empty window
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

/** Category enabled and not currently in quiet hours. */
export function allows(prefs: NotificationPrefs, category: NotificationCategory, minute: number): boolean {
  if (!prefs[category]) return false;
  return !inQuietHours(prefs, minute);
}
