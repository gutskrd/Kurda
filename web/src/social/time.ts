import type { MessageKey } from '../i18n/en';

/**
 * Short durations for the rail.
 *
 * Everything here is compact on purpose: the rail is a narrow column beside the
 * page, and "in a game for 1 hour and 4 minutes" would wrap onto three lines to
 * say what "1h 4m" says in one.
 *
 * The abbreviations themselves are language-specific — `m` is a minute in
 * English and Dutch, `d` (deqe) in Kurmancî, `dk` in Turkish — so the words come
 * from the catalogue and each function is handed a `t`. This module has no React
 * in it, which is why it is passed one rather than reading it from context.
 */
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** How long someone has been in a game: "just now", "7m", "1h 4m". */
export function elapsed(sinceIso: string, t: Translate, now = Date.now()): string {
  const start = new Date(sinceIso).getTime();
  if (Number.isNaN(start)) return '';
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) return t('time.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('time.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? t('time.hours', { count: hours }) : t('time.hoursMinutes', { hours, minutes: rest });
}

/** When someone was last around: "5m ago", "3h ago", "2d ago", "a while ago". */
export function lastSeen(iso: string | null, t: Translate, now = Date.now()): string {
  if (!iso) return t('time.aWhileAgo');
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return t('time.aWhileAgo');
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return t('time.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hoursAgo', { count: hours });
  const days = Math.floor(hours / 24);
  // past a month the exact number stops meaning anything on a friends list
  return days > 30 ? t('time.aWhileAgo') : t('time.daysAgo', { count: days });
}

/**
 * A badge never shows a number wide enough to break the layout.
 *
 * Deliberately not translated: "99+" is a digit string, and the rail's badge is
 * a fixed-width circle that a longer word would burst.
 */
export function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}
