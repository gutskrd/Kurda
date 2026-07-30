/**
 * Leaderboard rank helpers (KUR-063). Redis sorted sets are the fast path; this
 * pure logic backs the Postgres rebuild/fallback and computes a user's rank
 * from scores. Kept pure so ranking is unit-testable without Redis.
 */

export type BoardType = 'rating' | 'weekly_xp';

export function isBoardType(value: string): value is BoardType {
  return value === 'rating' || value === 'weekly_xp';
}

export interface ScoreRow {
  userId: string;
  username: string;
  score: number;
}

export interface RankedEntry extends ScoreRow {
  rank: number;
}

/**
 * A user's rank from a descending score list: strictly-higher scores rank above
 * them, ties share the higher rank (competition ranking). Works whether or not
 * the user is themselves in the list — a shadow-excluded user still gets a
 * plausible rank against everyone else, so they're never told they're excluded.
 */
export function rankForScore(scoresDesc: number[], myScore: number): number {
  let higher = 0;
  for (const s of scoresDesc) {
    if (s > myScore) higher += 1;
    else break; // sorted descending → no more higher scores
  }
  return higher + 1;
}

/** Attach 1-based ranks to an already-sorted (descending) score list. */
export function withRanks(rows: ScoreRow[]): RankedEntry[] {
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}
