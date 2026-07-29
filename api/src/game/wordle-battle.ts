/**
 * Wordle multiplayer Battle — placement ranking (KUR-306). Pure comparator +
 * ranking for a match where every player raced the same hidden word. The
 * server drives the match (session engine #051, realtime #049); this module
 * decides the finishing order and the placement XP, so it is fully
 * unit-testable with no I/O.
 *
 * Tiebreak chain (per the spec):
 *   1. First to solve the word (solvers rank above non-solvers).
 *   2. If multiple solve it, the fewest guesses wins.
 *   3. If still tied, the fastest completion time wins.
 * Players who didn't solve are ranked below all solvers, by how close they got
 * (progress), then by time.
 */

export interface BattlePlayerResult {
  userId: string;
  solved: boolean;
  /** guesses used (attempts taken) */
  guesses: number;
  /** completion time from match start, in ms */
  timeMs: number;
  /** closeness for ranking non-solvers — e.g. count of correct (green) letters */
  progress: number;
}

export interface RankedBattlePlayer extends BattlePlayerResult {
  /** 1-based; ties share a rank (standard competition ranking: 1,2,2,4) */
  rank: number;
}

/**
 * Order two players by the tiebreak chain. Returns <0 if `a` finishes ahead of
 * `b`, >0 if behind, 0 if they are indistinguishable on every key.
 */
export function compareBattlePlayers(a: BattlePlayerResult, b: BattlePlayerResult): number {
  // 1. Solvers ahead of non-solvers.
  if (a.solved !== b.solved) return a.solved ? -1 : 1;

  if (a.solved && b.solved) {
    // 2. Fewest guesses, then 3. fastest time.
    if (a.guesses !== b.guesses) return a.guesses - b.guesses;
    return a.timeMs - b.timeMs;
  }

  // Both unsolved: closer (more progress) first, then less time as a nudge.
  if (a.progress !== b.progress) return b.progress - a.progress;
  return a.timeMs - b.timeMs;
}

/**
 * Rank all players in a match. Stable, and uses standard competition ranking:
 * players who tie on every key share a rank and the next rank skips
 * accordingly (1, 2, 2, 4). Input is not mutated.
 */
export function rankBattle(players: readonly BattlePlayerResult[]): RankedBattlePlayer[] {
  const sorted = [...players].sort(compareBattlePlayers);
  const ranked: RankedBattlePlayer[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const player = sorted[i];
    if (player === undefined) continue;
    const prev = ranked[i - 1];
    const prevRaw = sorted[i - 1];
    const tiedWithPrev = prevRaw !== undefined && compareBattlePlayers(prevRaw, player) === 0;
    const rank = prev !== undefined && tiedWithPrev ? prev.rank : i + 1;
    ranked.push({ ...player, rank });
  }
  return ranked;
}

/** The match winner(s) — rank 1. Usually one; more only on an exact tie. */
export function battleWinners(ranked: readonly RankedBattlePlayer[]): RankedBattlePlayer[] {
  return ranked.filter((p) => p.rank === 1);
}

export const BATTLE_PARTICIPATION_XP = 20;
export const BATTLE_WIN_XP = 100;

/**
 * Placement XP: 1st place earns BATTLE_WIN_XP, last place earns
 * BATTLE_PARTICIPATION_XP, and places in between scale linearly by rank. A
 * solo match (or any 1-player edge) earns the win amount. Tunable.
 */
export function placementXp(rank: number, playerCount: number): number {
  if (playerCount <= 1) return BATTLE_WIN_XP;
  const clampedRank = Math.min(Math.max(rank, 1), playerCount);
  const spread = BATTLE_WIN_XP - BATTLE_PARTICIPATION_XP;
  return Math.round(
    BATTLE_PARTICIPATION_XP + (spread * (playerCount - clampedRank)) / (playerCount - 1),
  );
}
