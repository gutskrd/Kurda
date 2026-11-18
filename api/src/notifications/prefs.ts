/**
 * Pure notification preference logic. A push needs its category on and a moment outside quiet hours. The gate runs at
 * delivery, so a change applies to sends already queued. Marketing defaults off: opt-in only. A letter's push is not
 * dropped in quiet hours but waits for them to end (`minutesToQuietEnd`, push/service.ts), going then if still news.
 */

export const NOTIFICATION_CATEGORIES = ['streak', 'friends', 'games', 'events', 'marketing', 'progress', 'letters'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface NotificationPrefs {
  streak: boolean;
  friends: boolean;
  games: boolean;
  events: boolean;
  marketing: boolean;
  /** League and badge news: a promotion, a badge earned. */
  progress: boolean;
  /** letters by bird: a pen pal's bird at the window, your own home with an answer */
  letters: boolean;
  /** Minutes-of-day [0,1440). null/null = no quiet hours. May wrap midnight. */
  quietStartMin: number | null;
  quietEndMin: number | null;
}

/**
 * Preferences for someone who never changed them. Streak reminders and league and badge news start off for a minor,
 * as engagement prompts should be a young person's choice; the in-app list still shows the news.
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

/** Minutes from `minute` until the quiet window ends, or null outside it; a push held for quiet hours is sent then. */
export function minutesToQuietEnd(prefs: NotificationPrefs, minute: number): number | null {
  if (!inQuietHours(prefs, minute) || prefs.quietEndMin === null) return null;
  const left = (prefs.quietEndMin - minute + 1440) % 1440;
  return left === 0 ? 1440 : left;
}
