/**
 * Latency compensation for game scoring (KUR-057). Pure. A player's answer
 * receipt time includes network travel; we credit back half their RTT (one
 * leg) so higher-latency players aren't unfairly slow. The compensation is
 * CAPPED so inflating RTT can't farm the speed bonus (sandbagging), and an
 * anomaly flag is raised for KUR-058.
 */

/** Maximum RTT (ms) that counts toward compensation. */
export const RTT_CAP_MS = 600;
/** RTT above this is implausible for a real connection → anomaly (KUR-058). */
export const RTT_ANOMALY_MS = 1500;

/**
 * Server-recorded elapsed time minus one network leg (RTT/2), using the
 * capped RTT, floored at 0.
 */
export function compensatedElapsed(elapsedMs: number, rttMs: number, capMs = RTT_CAP_MS): number {
  const usableRtt = Math.min(Math.max(0, rttMs), capMs);
  return Math.max(0, elapsedMs - usableRtt / 2);
}

/** True when a measured RTT is implausibly high (likely sandbagging). */
export function isRttAnomalous(rttMs: number, thresholdMs = RTT_ANOMALY_MS): boolean {
  return rttMs > thresholdMs;
}

/** min / median / p95 / max of a set of RTT samples (for per-game metrics). */
export function rttDistribution(samples: number[]): { min: number; median: number; p95: number; max: number; count: number } {
  if (samples.length === 0) return { min: 0, median: 0, p95: 0, max: 0, count: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!;
  return { min: sorted[0]!, median: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1]!, count: sorted.length };
}
