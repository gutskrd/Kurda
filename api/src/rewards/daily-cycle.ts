import { dayDiff } from '../streaks/streak-logic.js';

/**
 * The pure daily Zêr reward cycle: from the last claim date and today (local 'YYYY-MM-DD' dates), whether a claim is
 * available and which cycle day it lands on; day 7 pays the bonus. Server time only. A claim needs a lesson or practice
 * session finished that day, since paying for showing up is risky while recognising learning is not (the roadmap in
 * docs/research). A missed day never resets the cycle, which would punish exactly the lapse a learner needs to recover
 * from.
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
  /** A claim now would succeed: not claimed today, and learned today. */
  canClaim: boolean;
  /** The cycle day a claim now would land on (1..7). */
  claimableDay: number;
  reward: number;
  /** the whole cycle's rewards, for the calendar UI. */
  schedule: readonly number[];
  alreadyClaimedToday: boolean;
  /** A lesson or practice session was finished today; while false and unclaimed, the client says what to do instead. */
  learnedToday: boolean;
}

/** Reward for a given cycle day (1..7). */
export function rewardForDay(cycleDay: number): number {
  const idx = Math.min(Math.max(cycleDay, 1), CYCLE_LENGTH) - 1;
  return CYCLE_REWARDS[idx]!;
}

/** The cycle day a claim on `today` lands on: the day after the last claim (wrapping 7 to 1), however long ago. Day 1 for a first claim. */
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
