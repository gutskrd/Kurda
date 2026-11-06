/**
 * Leaderboard rank helpers (KUR-063). Redis sorted sets are the fast path; this
 * pure logic backs the Postgres rebuild/fallback and computes a user's rank
 * from scores. Kept pure so ranking is unit-testable without Redis.
 */

/**
 * What a board ranks. The weekly-XP board is this week's XP, starting afresh
 * every Monday. The Zêr and Gewher boards rank what each person holds now, all
 * time, highest first: a balance grows over months of playing and falls when it
 * is spent, so it says something different about a person than one week does,
 * and it has a board of its own rather than a column on the weekly one.
 *
 * The all-time rating board was fed by the ranked quiz and frozen since it
 * went; a game's skill boards are Game Ranks' own (ranks/service.ts), per game.
 */
export const BOARD_TYPES = ['weekly_xp', 'zer', 'gewher'] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

export function isBoardType(value: string): value is BoardType {
  return (BOARD_TYPES as readonly string[]).includes(value);
}

/**
 * The boards that rank a wallet balance, and the wallet currency behind each.
 * The board is named for the currency as the app names it, Gewher, while the
 * wallet has always called the same thing 'gems'.
 */
export const BALANCE_BOARDS = { zer: 'zer', gewher: 'gems' } as const;
export type BalanceBoardType = keyof typeof BALANCE_BOARDS;

export function isBalanceBoard(type: BoardType): type is BalanceBoardType {
  return type === 'zer' || type === 'gewher';
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
 * Attach ranks to an already-sorted (descending) score list, ties sharing the
 * higher place as they do in `rankForScore` (1, 2, 2, 4), so the number beside
 * a name in the list agrees with the one the board gives that person as `me`.
 * Balances tie far more often than a week's XP does: everybody who has only
 * ever claimed the same daily rewards holds the same Zêr.
 *
 * startAt is the 0-based position of the first row within the whole board, so a
 * second page continues from 26 instead of starting again at 1. firstRank is
 * the first row's own place, which only the whole board knows when that row
 * ties with the last one on the page before; left out, it is startAt + 1.
 */
export function withRanks(rows: ScoreRow[], startAt = 0, firstRank = startAt + 1): RankedEntry[] {
  let rank = firstRank;
  return rows.map((r, i) => {
    if (i > 0 && r.score < rows[i - 1]!.score) rank = startAt + i + 1;
    return { ...r, rank };
  });
}
