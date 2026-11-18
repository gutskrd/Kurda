/** What direct and group threads share. */

/**
 * How often a thread refetches its history: slowly while the realtime connection is live, briskly when it is not,
 * and only while the tab is in view (lib/pollWhileVisible.ts).
 */
export const THREAD_POLL_LIVE = 20_000;
export const THREAD_POLL_FALLBACK = 4_000;

/** Messages oldest first by server time; a missing list from a successful response gives an empty thread. */
export function byTime<T extends { createdAt: string }>(msgs: readonly T[] | undefined | null): T[] {
  if (!Array.isArray(msgs)) return [];
  return [...msgs].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}
