/**
 * Pure notification-preference logic (KUR-095). A push is allowed only if its
 * category is enabled AND the moment isn't inside the user's quiet hours. The
 * gate is evaluated at delivery time (in the worker), so a preference change is
 * honored even for sends already sitting in the queue. Marketing defaults OFF
 * for GDPR — opt-in, never opt-out.
 *
 * A letter is somebody writing to you, so its push is not thrown away in
 * quiet hours like a reminder would be: it waits for them to end
 * (`minutesToQuietEnd`, push/service.ts), and goes then if it is still news.
 */

export const NOTIFICATION_CATEGORIES = ['streak', 'friends', 'games', 'events', 'marketing', 'progress', 'letters'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationPrefs {
  streak: boolean;
  friends: boolean;
  games: boolean;
  events: boolean;
  marketing: boolean;
  /** leagues and badges: a promotion, a badge earned (contract 4) */
  progress: boolean;
  /** letters by bird: a pen pal's bird at the window, your own home with an answer */
  letters: boolean;
  /** Minutes-of-day [0,1440). null/null = no quiet hours. May wrap midnight. */
  quietStartMin: number | null;
  quietEndMin: number | null;
}

/**
 * The preferences of someone who has never changed them. For a minor, streak
 * reminders start off: a daily nudge to keep a run going is the kind of
 * engagement prompt that should be a young person's choice, not a default.
 * League and badge news ("progress") starts off for a minor too, for the same
 * reason — the in-app list still has it, only the push waits for their choice.
 */
export function defaultPrefs(opts: { minor?: boolean } = {}): NotificationPrefs {
  return {
    streak: !opts.minor,
    friends: true,
    games: true,
    events: true,
    marketing: false, // GDPR: explicit opt-in
    progress: !opts.minor,
    letters: true,
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

/**
 * How many minutes from `minute` until the quiet window ends, or null when
 * `minute` is not in it. A push that waits for the end of quiet hours
 * (push/service.ts `HELD_IN_QUIET`) is sent then.
 */
export function minutesToQuietEnd(prefs: NotificationPrefs, minute: number): number | null {
  if (!inQuietHours(prefs, minute) || prefs.quietEndMin === null) return null;
  const left = (prefs.quietEndMin - minute + 1440) % 1440;
  return left === 0 ? 1440 : left;
}
