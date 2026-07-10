import { dayDiff } from '../streaks/streak-logic.js';

/**
 * Daily Zêr reward cycle (KUR-067). Pure: given the last claim date and today
 * (both tz-local 'YYYY-MM-DD' from KUR-031's shared day logic), decide whether a
 * claim is available and which cycle day it lands on. The escalating 7-day cycle
 * resets after any missed day; day 7 pays the bonus. Server time only — device
 * clocks never enter here.
 */

/** Zêr paid on each day of the cycle (index 0 = day 1 … index 6 = day 7 bonus). */
export const CYCLE_REWARDS = [10, 15, 20, 25, 30, 40, 100] as const;
export const CYCLE_LENGTH = CYCLE_REWARDS.length;

export interface DailyRewardState {
  /** last claimed cycle day, 1..7 (0 = never claimed). */
  cycleDay: number;
  /** tz-local date of the last claim, or null. */
  lastClaimOn: string | null;
}

export interface DailyRewardStatus {
  canClaim: boolean;
  /** the cycle day a claim right now would land on (1..7). */
  claimableDay: number;
  reward: number;
  /** the whole cycle's rewards, for the calendar UI. */
  schedule: readonly number[];
  alreadyClaimedToday: boolean;
}

/** Reward for a given cycle day (1..7). */
export function rewardForDay(cycleDay: number): number {
  const idx = Math.min(Math.max(cycleDay, 1), CYCLE_LENGTH) - 1;
  return CYCLE_REWARDS[idx]!;
}

/**
 * The cycle day a claim on `today` would land on: the day after the last claim
 * if it was exactly yesterday (wrapping 7→1), otherwise day 1 (first claim, or
 * the run reset because a day was missed).
 */
export function nextCycleDay(state: DailyRewardState, today: string): number {
  if (state.lastClaimOn === null) return 1;
  const gap = dayDiff(state.lastClaimOn, today);
  if (gap <= 0) return state.cycleDay; // already claimed today (or clock skew)
  if (gap === 1) return (state.cycleDay % CYCLE_LENGTH) + 1; // consecutive → advance/wrap
  return 1; // missed a day → reset to day 1
}

/** What the UI shows and the claim endpoint enforces, for `today`. */
export function statusFor(state: DailyRewardState, today: string): DailyRewardStatus {
  const alreadyClaimedToday = state.lastClaimOn !== null && dayDiff(state.lastClaimOn, today) <= 0;
  const claimableDay = nextCycleDay(state, today);
  return {
    canClaim: !alreadyClaimedToday,
    claimableDay,
    reward: rewardForDay(claimableDay),
    schedule: CYCLE_REWARDS,
    alreadyClaimedToday,
  };
}
