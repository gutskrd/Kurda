/**
 * Server-authoritative game scoring (KUR-053). Pure — the engine feeds it
 * server-side facts (correctness + server-timestamped elapsed time) and gets
 * points back; clients never compute scores. Points reward correctness and
 * speed; ties break on cumulative answer time (faster overall wins).
 */

export const POINTS_BASE = 500;
export const SPEED_BONUS = 500;

export interface QuestionScoreInput {
  correct: boolean;
  /** ms from question open to the server-recorded answer receipt */
  elapsedMs: number;
  /** the answer window (question duration) in ms */
  windowMs: number;
}

/**
 * Points for one question: 0 if wrong/timed-out, else base + a speed bonus
 * that decays linearly from full (answered instantly) to zero (answered at
 * the deadline). Elapsed is clamped to the window so grace-zone answers get
 * the minimum bonus, never a negative one.
 */
export function questionPoints({ correct, elapsedMs, windowMs }: QuestionScoreInput): number {
  if (!correct) return 0;
  const frac = windowMs > 0 ? Math.min(1, Math.max(0, elapsedMs / windowMs)) : 0;
  return POINTS_BASE + Math.round(SPEED_BONUS * (1 - frac));
}

export interface ScoreLine {
  userId: string;
  points: number;
  /** cumulative answer time across the game; lower is the tiebreak winner */
  cumulativeMs: number;
}

export type RankedScore<T extends ScoreLine> = T & { rank: number };

/**
 * Rank score lines: most points first, ties broken by lower cumulative
 * answer time. Ranks are 1-based and dense within the sorted order.
 */
export function rankScores<T extends ScoreLine>(lines: T[]): Array<RankedScore<T>> {
  const sorted = [...lines].sort((a, b) => b.points - a.points || a.cumulativeMs - b.cumulativeMs);
  return sorted.map((line, i) => ({ ...line, rank: i + 1 }));
}
