import type { BotSignals } from './scoring.js';

/**
 * Derive behavioral bot signals (KUR-110) from concrete aggregates — pure and
 * deterministic so every mapping is unit-testable. The raw sources are gathered
 * by the service (game answer stats #058, activity-hour spread from the XP
 * ledger, accounts-per-device from #296); this turns them into the 0..1 anomaly
 * levels the scoring core expects.
 */

export interface SignalInput {
  /** questions answered across ranked games (#058 cheat_stats) */
  questionsAnswered: number;
  /** answers faster than humanly possible */
  impossibleCount: number;
  /** suspiciously fast answers (below the human floor but not impossible) */
  fastCount: number;
  /** round-trip-time anomalies (scripted/uniform latency) */
  rttAnomalyCount: number;
  /** distinct hours-of-day the account was active over the recent window (0..24) */
  distinctActiveHours: number;
  /** accounts sharing this account's device fingerprint (#296) */
  deviceAccountCount: number;
}

/** Below this many answered questions the behavioral signals aren't meaningful. */
export const MIN_SAMPLE = 20;
/** A human is not active in more than this many distinct hours-of-day. */
export const HUMAN_ACTIVE_HOURS = 12;

function ratio(n: number, total: number): number {
  return total <= 0 ? 0 : Math.max(0, Math.min(1, n / total));
}

export function deriveSignals(input: SignalInput): BotSignals {
  // Too little data → no behavioral suspicion (device still counts downstream).
  const enough = input.questionsAnswered >= MIN_SAMPLE;

  // Impossibly-fast answers scale up quickly (any real fraction is damning).
  const pacingAnomaly = enough ? Math.min(1, ratio(input.impossibleCount, input.questionsAnswered) * 4) : 0;

  // 24/7 activity: distinct active hours beyond the human band, saturating at 24.
  const uptimeAnomaly = Math.max(0, Math.min(1, (input.distinctActiveHours - HUMAN_ACTIVE_HOURS) / (24 - HUMAN_ACTIVE_HOURS)));

  // Scripted uniform timing: fast + rtt anomalies as a share of all answers.
  const timingUniformity = enough
    ? ratio(input.fastCount + input.rttAnomalyCount, input.questionsAnswered)
    : 0;

  return {
    pacingAnomaly,
    uptimeAnomaly,
    timingUniformity,
    deviceAccountCount: input.deviceAccountCount,
  };
}
