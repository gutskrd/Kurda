/**
 * What the daily Zêr card offers (KUR-067), from GET /rewards/daily.
 *
 * Pure, so the three states the card can be in are pinned by tests rather than
 * by reading a component.
 */

export interface DailyStatus {
  canClaim: boolean;
  claimableDay: number;
  reward: number;
  schedule: number[];
  alreadyClaimedToday: boolean;
  cycleDay: number;
  /**
   * A lesson or practice session was finished today — what a claim needs.
   * Absent on older responses, where `canClaim` alone decides.
   */
  learnedToday?: boolean;
  /** gems a claim today adds for a Hevalo+ member; 0 or absent for everyone else */
  plusGems?: number;
}

/** What POST /rewards/daily/claim answers with, as much of it as the card shows. */
export interface DailyClaim {
  reward: number;
  /** gems a Hevalo+ member received with the claim; 0 or absent for everyone else */
  plusGems?: number;
}

/** The gems to say beside the Zêr, or null when there are none to say. */
export function plusGemsOf(from: { plusGems?: number } | null | undefined): number | null {
  const gems = from?.plusGems ?? 0;
  return gems > 0 ? gems : null;
}

/**
 * - `claim`: today's reward is there to take.
 * - `learnFirst`: not claimed yet, and nothing learned today. The reward is
 *   paid for learning, so the card says what to do rather than offering a
 *   claim the server would refuse.
 * - `claimed`: taken today; come back tomorrow.
 */
export type DailyAction = 'claim' | 'learnFirst' | 'claimed';

export function dailyAction(status: DailyStatus): DailyAction {
  if (status.canClaim) return 'claim';
  // explicitly false only: an older server sends no learnedToday at all
  if (!status.alreadyClaimedToday && status.learnedToday === false) return 'learnFirst';
  return 'claimed';
}

export type CellState = 'claimed' | 'today' | 'upcoming';

/**
 * One day of the seven. Until today is claimed — whether it can be right now
 * or only after a lesson — today's cell is the one marked, and the days before
 * it in this cycle are done.
 */
export function cellState(status: DailyStatus, day: number): CellState {
  if (dailyAction(status) !== 'claimed') {
    if (day < status.claimableDay) return 'claimed';
    if (day === status.claimableDay) return 'today';
    return 'upcoming';
  }
  return day <= status.cycleDay ? 'claimed' : 'upcoming';
}
