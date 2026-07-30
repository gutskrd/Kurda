/**
 * Post-game rewards (KUR-059). Pure. XP for finishing a game: a base
 * participation grant plus a win bonus for 1st place. The rating delta is a
 * placeholder here — real MMR movement lands in KUR-061.
 */

export const GAME_BASE_XP = 15;
export const GAME_WIN_BONUS_XP = 15;

/** XP for a player who finished at `rank` (1 = winner). */
export function gameXp(rank: number): number {
  return GAME_BASE_XP + (rank === 1 ? GAME_WIN_BONUS_XP : 0);
}

/** Placeholder rating delta until KUR-061 computes real MMR movement. */
export function ratingDeltaPlaceholder(): number {
  return 0;
}
