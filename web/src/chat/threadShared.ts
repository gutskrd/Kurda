/**
 * What a chat thread needs whether it is direct or a group.
 *
 * These were copied into each thread as they were written, which is how a
 * fallback poll can end up at two different intervals for the same reason.
 */

/**
 * How often a thread re-reads its own history.
 *
 * When the realtime socket is live it carries every message instantly, so
 * polling is only a slow safety net. When it is not connected, a brisk poll is
 * what keeps chat feeling live for everyone.
 */
export const THREAD_POLL_LIVE = 20_000;
export const THREAD_POLL_FALLBACK = 4_000;

/**
 * Oldest→newest by server timestamp, so a thread always reads top to bottom.
 *
 * Tolerates a missing list: `ok` is about the status code, not the shape, and a
 * 200 carrying no `messages` should leave an empty thread rather than throw.
 */
export function byTime<T extends { createdAt: string }>(msgs: readonly T[] | undefined | null): T[] {
  return [...(msgs ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
}
