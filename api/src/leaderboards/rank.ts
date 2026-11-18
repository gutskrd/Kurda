/**
 * Leaderboard rank helpers. Redis sorted sets are the fast path; this pure logic backs the Postgres rebuild and
 * fallback and computes a user's rank from scores.
 */

/**
 * What a board ranks: this week's XP, starting afresh every Monday, or the Zêr or Gewher each person holds now,
 * which says something different and so has a board of its own. Per-game skill boards are Game Ranks'
 * (ranks/service.ts).
 */
export const BOARD_TYPES = ['weekly_xp', 'zer', 'gewher'] as const;
export type BoardType = (typeof BOARD_TYPES)[number];

export function isBoardType(value: string): value is BoardType {
  return (BOARD_TYPES as readonly string[]).includes(value);
}

/** The balance boards and the wallet currency behind each; the app's Gewher is 'gems' in the wallet. */
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
 * A user's rank in a descending score list: strictly higher scores rank above, ties share the higher rank. Works
 * whether or not the user is in the list, so a shadow-excluded user still gets a plausible rank.
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
 * Attaches ranks to a descending score list, ties sharing the higher place (1, 2, 2, 4) as in `rankForScore`, so a
 * row's number matches the board's `me`. Balances tie often. `startAt` is the first row's 0-based position on the
 * whole board, so page two continues from 26; `firstRank` is that row's own place when it ties with the previous
 * page, defaulting to startAt + 1.
 */
export function withRanks(rows: ScoreRow[], startAt = 0, firstRank = startAt + 1): RankedEntry[] {
  let rank = firstRank;
  return rows.map((r, i) => {
    if (i > 0 && r.score < rows[i - 1]!.score) rank = startAt + i + 1;
    return { ...r, rank };
  });
}
