/** What today's Zêr offers in the daily view (GET /me/today, as GET /rewards/daily says it). Pure, so its three states are pinned by tests. */

export interface DailyStatus {
  canClaim: boolean;
  claimableDay: number;
  reward: number;
  schedule: number[];
  alreadyClaimedToday: boolean;
  cycleDay: number;
  /** A lesson or practice session was finished today, which a claim needs. Absent on older responses. */
  learnedToday?: boolean;
  /** Gems a claim today adds for a Hevalo+ member; 0 or absent for everyone else. */
  plusGems?: number;
}

/** What POST /rewards/daily/claim answers with, as much of it as the card shows. */
export interface DailyClaim {
  reward: number;
  /** Gems a Hevalo+ member received with the claim; 0 or absent for everyone else. */
  plusGems?: number;
}

/** The gems to say beside the Zêr, or null when there are none to say. */
export function plusGemsOf(from: { plusGems?: number } | null | undefined): number | null {
  const gems = from?.plusGems ?? 0;
  return gems > 0 ? gems : null;
}

/**
 * - `claim`: today's reward can be taken.
 * - `learnFirst`: not claimed and nothing learned today, so the card asks for a lesson first.
 * - `claimed`: taken today.
 */
export type DailyAction = 'claim' | 'learnFirst' | 'claimed';

export function dailyAction(status: DailyStatus): DailyAction {
  if (status.canClaim) return 'claim';
  // Explicitly false only: an older server sends no learnedToday at all.
  if (!status.alreadyClaimedToday && status.learnedToday === false) return 'learnFirst';
  return 'claimed';
}

export type CellState = 'claimed' | 'today' | 'upcoming';

/** One day of the seven. Until today is claimed, today's cell is marked and earlier days in the cycle are done. */
export function cellState(status: DailyStatus, day: number): CellState {
  if (dailyAction(status) !== 'claimed') {
    if (day < status.claimableDay) return 'claimed';
    if (day === status.claimableDay) return 'today';
    return 'upcoming';
  }
  return day <= status.cycleDay ? 'claimed' : 'upcoming';
}

const claimedListeners = new Set<() => void>();

/** Today's reward was claimed: a balance shown on another tab (Learn's bar) reads it again. */
export function dailyClaimed(): void {
  for (const l of claimedListeners) l();
}

/** Hear about claims. Returns how to stop. */
export function onDailyClaimed(listener: () => void): () => void {
  claimedListeners.add(listener);
  return () => {
    claimedListeners.delete(listener);
  };
}
