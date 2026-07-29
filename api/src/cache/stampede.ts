/**
 * Cache-stampede primitives (KUR-116). Two independent defenses against a hot
 * key expiring and every request hammering the origin at once:
 *
 *  - TTL jitter: spread expiries so keys set together don't all lapse together.
 *  - Probabilistic early recompute (XFetch): a request may voluntarily refresh a
 *    still-valid key slightly early, with probability rising as expiry nears — so
 *    one request refreshes ahead of the herd instead of all missing at expiry.
 *
 * Both are pure and deterministic under an injected RNG, so they're testable.
 */

export const DEFAULT_JITTER_RATIO = 0.1;
export const DEFAULT_XFETCH_BETA = 1;

/** Apply ±`ratio` random jitter to a TTL (seconds), never below 1. */
export function applyJitter(ttlSeconds: number, ratio = DEFAULT_JITTER_RATIO, rng: () => number = Math.random): number {
  if (ttlSeconds <= 0 || ratio <= 0) return ttlSeconds;
  const factor = 1 + (rng() * 2 - 1) * ratio; // in [1-ratio, 1+ratio)
  return Math.max(1, Math.round(ttlSeconds * factor));
}

/**
 * XFetch decision: should this request recompute a value that is still cached?
 * `remainingMs` until expiry, `recomputeMs` = how long the value took to build,
 * `beta` tunes eagerness. Returns true as expiry nears (always true once expired).
 */
export function shouldEarlyRecompute(
  remainingMs: number,
  recomputeMs: number,
  beta = DEFAULT_XFETCH_BETA,
  rng: () => number = Math.random,
): boolean {
  if (remainingMs <= 0) return true;
  const gap = recomputeMs * beta * -Math.log(rng() || Number.MIN_VALUE);
  return gap >= remainingMs;
}
