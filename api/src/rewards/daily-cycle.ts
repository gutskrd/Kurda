import { dayDiff } from '../streaks/streak-logic.js';

/**
 * Daily Zêr reward cycle (KUR-067). Pure: given the last claim date and today
 * (both tz-local 'YYYY-MM-DD' from KUR-031's shared day logic), decide whether a
 * claim is available and which cycle day it lands on. Day 7 pays the bonus.
 * Server time only — device clocks never enter here.
 *
 * The reward is paid for learning, not for opening the app: a claim needs a
 * lesson or practice session finished that same day. Rewards expected merely
 * for showing up are the kind the motivation research is most wary of (Deci,
 * Koestner & Ryan 1999; the roadmap in docs/research reads it as: paying for
 * participation is risky, recognising learning is not). And a missed day no
 * longer sends the cycle back to day 1: the next claim is simply the next day
 * of the cycle. A reset punished exactly the lapse a learner most needs to come
 * back from.
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
  /** a claim right now would succeed: not claimed yet today, and learned today */
  canClaim: boolean;
  /** the cycle day a claim right now would land on (1..7). */
  claimableDay: number;
  reward: number;
  /** the whole cycle's rewards, for the calendar UI. */
  schedule: readonly number[];
  alreadyClaimedToday: boolean;
  /**
   * A lesson or practice session has been finished today. While false and the
   * day is unclaimed, the client says what to do instead of offering a claim.
   */
  learnedToday: boolean;
}

/** Reward for a given cycle day (1..7). */
export function rewardForDay(cycleDay: number): number {
  const idx = Math.min(Math.max(cycleDay, 1), CYCLE_LENGTH) - 1;
  return CYCLE_REWARDS[idx]!;
}

/**
 * The cycle day a claim on `today` would land on: the day after the last claim
 * (wrapping 7→1), however long ago that was. Day 1 for a first claim.
 */
export function nextCycleDay(state: DailyRewardState, today: string): number {
  if (state.lastClaimOn === null) return 1;
  const gap = dayDiff(state.lastClaimOn, today);
  if (gap <= 0) return state.cycleDay; // already claimed today (or clock skew)
  return (state.cycleDay % CYCLE_LENGTH) + 1; // the next day, missed days or not
}

/** What the UI shows and the claim endpoint enforces, for `today`. */
export function statusFor(state: DailyRewardState, today: string, learnedToday: boolean): DailyRewardStatus {
  const alreadyClaimedToday = state.lastClaimOn !== null && dayDiff(state.lastClaimOn, today) <= 0;
  const claimableDay = nextCycleDay(state, today);
  return {
    canClaim: !alreadyClaimedToday && learnedToday,
    claimableDay,
    reward: rewardForDay(claimableDay),
    schedule: CYCLE_REWARDS,
    alreadyClaimedToday,
    learnedToday,
  };
}
