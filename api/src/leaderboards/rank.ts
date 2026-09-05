/**
 * Leaderboard rank helpers (KUR-063). Redis sorted sets are the fast path; this
 * pure logic backs the Postgres rebuild/fallback and computes a user's rank
 * from scores. Kept pure so ranking is unit-testable without Redis.
 */

export type BoardType = 'rating' | 'weekly_xp';

export function isBoardType(value: string): value is BoardType {
  return value === 'rating' || value === 'weekly_xp';
}

/** Who a board covers: everyone, your friends, or people in your country. */
export const BOARD_SCOPES = ['global', 'friends', 'country'] as const;
export type BoardScope = (typeof BOARD_SCOPES)[number];

export function isBoardScope(value: string): value is BoardScope {
  return (BOARD_SCOPES as readonly string[]).includes(value);
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

/**
 * Attach ranks to an already-sorted (descending) score list.
 *
 * startAt is the 0-based position of the first row within the whole board, so a
 * second page continues from 51 instead of starting again at 1.
 */
export function withRanks(rows: ScoreRow[], startAt = 0): RankedEntry[] {
  return rows.map((r, i) => ({ ...r, rank: startAt + i + 1 }));
}
