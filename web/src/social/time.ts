/**
 * Short durations for the rail.
 *
 * Everything here is compact on purpose: the rail is a narrow column beside the
 * page, and "in a game for 1 hour and 4 minutes" would wrap onto three lines to
 * say what "1h 4m" says in one.
 */

/** How long someone has been in a game: "just now", "7m", "1h 4m". */
export function elapsed(sinceIso: string, now = Date.now()): string {
  const start = new Date(sinceIso).getTime();
  if (Number.isNaN(start)) return '';
  const seconds = Math.max(0, Math.floor((now - start) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** When someone was last around: "5m ago", "3h ago", "2d ago", "a while ago". */
export function lastSeen(iso: string | null, now = Date.now()): string {
  if (!iso) return 'a while ago';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'a while ago';
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  // past a month the exact number stops meaning anything on a friends list
  return days > 30 ? 'a while ago' : `${days}d ago`;
}

/** A badge never shows a number wide enough to break the layout. */
export function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}
