/** Streak display helpers. Pure. */
import type { StreakRepairOffer } from '@kurda/shared';

export interface Streak {
  current: number;
  longest: number;
  freezes: number;
  lastActiveOn: string | null;
  /** Days with a finished lesson or practice session, ever; absent on older responses. */
  daysLearned?: number;
  /** Finished sessions towards the next freeze, out of `sessionsPerFreeze`. */
  freezeProgress?: number;
  sessionsPerFreeze?: number;
  /** The most freezes that can be held at once. */
  maxFreezes?: number;
  /** The missed day the last freeze covered, 'YYYY-MM-DD', or null; absent on older responses. */
  freezeUsedOn?: string | null;
  /**
   * The ended streak that can still be restored: its length, the current cost and when the offer ends. Null when
   * there is none; absent on older responses.
   */
  repair?: StreakRepairOffer | null;
}

/** What the server pays a freeze for, when it does not say (older responses). */
const SESSIONS_PER_FREEZE = 5;

/**
 * The numbers shown beside the streak: the longest run and days learned, which never go down, and the freezes
 * earned with their cost. They soften the streak, which a missed day resets.
 */
export function learningStats(streak: Streak): {
  longest: number;
  daysLearned: number;
  freezes: number;
  sessionsPerFreeze: number;
} {
  return {
    longest: streak.longest,
    daysLearned: streak.daysLearned ?? 0,
    freezes: streak.freezes,
    sessionsPerFreeze: streak.sessionsPerFreeze ?? SESSIONS_PER_FREEZE,
  };
}

/** Which day-count form the flame label needs; the words themselves live in the catalogue. */
export function streakLabelKey(current: number): 'streak.day' | 'streak.days' {
  return current === 1 ? 'streak.day' : 'streak.days';
}
