/**
 * Online presence, derived at read time from `users.last_seen_at`. A user counts
 * as online if they were active within ONLINE_WINDOW_MS. Keeping this a pure
 * function (no DB, no clock capture) makes it trivially testable and lets every
 * list DTO compute presence consistently.
 */
export const ONLINE_WINDOW_MS = 5 * 60_000; // 5 minutes

export function isOnline(lastSeenAt: Date | null, now: Date = new Date()): boolean {
  return lastSeenAt != null && now.getTime() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}
