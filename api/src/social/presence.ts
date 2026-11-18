/**
 * Online presence derived at read time from `users.last_seen_at`: online means active within ONLINE_WINDOW_MS. Pure,
 * so every list computes presence the same way.
 */
export const ONLINE_WINDOW_MS = 5 * 60_000; // 5 minutes

export function isOnline(lastSeenAt: Date | null, now: Date = new Date()): boolean {
  return lastSeenAt != null && now.getTime() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}
