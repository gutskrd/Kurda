/** Pure notification-preference view helpers (KUR-095) — no React Native. */

export const NOTIFICATION_CATEGORIES = ['streak', 'friends', 'games', 'events', 'marketing'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  streak: 'Streak reminders',
  friends: 'Friend activity',
  games: 'Game invites & results',
  events: 'Events',
  marketing: 'News & offers',
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
