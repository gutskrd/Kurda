/** TTL jitter, so cache keys set together do not all expire together and send every request to the origin at once. */

export const DEFAULT_JITTER_RATIO = 0.1;

/** Apply ±`ratio` random jitter to a TTL (seconds), never below 1. */
export function applyJitter(ttlSeconds: number, ratio = DEFAULT_JITTER_RATIO, rng: () => number = Math.random): number {
  if (ttlSeconds <= 0 || ratio <= 0) return ttlSeconds;
  const factor = 1 + (rng() * 2 - 1) * ratio; // in [1-ratio, 1+ratio)
  return Math.max(1, Math.round(ttlSeconds * factor));
}
