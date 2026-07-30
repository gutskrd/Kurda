/**
 * Server-side cheat detection (KUR-058). Pure: it operates on facts the
 * server measured (answer elapsed time from server-stamped receipts,
 * correctness from the server-held answer key, RTT from the gateway) — NO
 * client-supplied verdict is ever an input. It only flags for human review
 * and (at high confidence) shadow-flags; it never bans automatically, so
 * legitimately fast experts are protected until a human confirms.
 */

/** Answers faster than this are "suspiciously fast". */
export const FAST_MS = 400;
/** Faster than this from question-open is beyond human reaction. */
export const IMPOSSIBLE_MS = 100;
/** 100% accuracy is only suspicious once the sample is large. */
export const MIN_QUESTIONS_FOR_ACCURACY = 50;
/** Rate-based flags need at least this many answers to be meaningful. */
export const MIN_SAMPLE = 20;

export interface PlayerStats {
  /** total answered (across games) */
  questionsAnswered: number;
  /** total correct */
  correctCount: number;
  /** answers under FAST_MS */
  fastCount: number;
  /** answers under IMPOSSIBLE_MS (beyond human reaction) */
  impossibleCount: number;
  /** RTT anomalies flagged by KUR-057 */
  rttAnomalyCount: number;
}

export type FlagType = 'PERFECT_ACCURACY' | 'CONSISTENTLY_FAST' | 'IMPOSSIBLE_TIMING' | 'RTT_ANOMALY';

export interface CheatFlag {
  type: FlagType;
  /** 0..1 */
  confidence: number;
  detail: string;
}

export interface CheatVerdict {
  flags: CheatFlag[];
  confidence: number;
  /** true → shadow-flag now; a human reviews before any penalty */
  shadow: boolean;
}

/** Evaluate accumulated per-player stats into review flags. */
export function evaluate(stats: PlayerStats): CheatVerdict {
  const flags: CheatFlag[] = [];
  const { questionsAnswered: n } = stats;

  if (n >= MIN_QUESTIONS_FOR_ACCURACY && stats.correctCount === n) {
    flags.push({ type: 'PERFECT_ACCURACY', confidence: 0.85, detail: `${n}/${n} correct over ${n} questions` });
  }

  if (n >= MIN_SAMPLE) {
    const fastRate = stats.fastCount / n;
    if (fastRate > 0.9) {
      flags.push({ type: 'CONSISTENTLY_FAST', confidence: 0.8, detail: `${Math.round(fastRate * 100)}% answered under ${FAST_MS}ms` });
    }
    const impossibleRate = stats.impossibleCount / n;
    if (stats.impossibleCount >= 5 && impossibleRate > 0.3) {
      flags.push({ type: 'IMPOSSIBLE_TIMING', confidence: 0.95, detail: `${stats.impossibleCount} answers under ${IMPOSSIBLE_MS}ms` });
    }
  }

  if (stats.rttAnomalyCount >= 3) {
    flags.push({ type: 'RTT_ANOMALY', confidence: 0.7, detail: `${stats.rttAnomalyCount} implausible RTT samples` });
  }

  const confidence = flags.reduce((max, f) => Math.max(max, f.confidence), 0);
  // shadow-flag on a single very-strong signal or two independent signals
  const shadow = confidence >= 0.9 || flags.length >= 2;
  return { flags, confidence, shadow };
}
