/** Streak display helpers (KUR-031). Pure so they can be unit-tested. */

export interface Streak {
  current: number;
  longest: number;
  freezes: number;
  lastActiveOn: string | null;
  /** days with a finished lesson or practice session, ever; absent on older responses */
  daysLearned?: number;
  /** finished sessions towards the next freeze, out of `sessionsPerFreeze` */
  freezeProgress?: number;
  sessionsPerFreeze?: number;
}

/** What the server pays a freeze for, when it does not say (older responses). */
const SESSIONS_PER_FREEZE = 5;

/**
 * The numbers shown beside the streak.
 *
 * The streak is the one a missed day takes to zero, which is the number most
 * likely to make somebody stop just after a lapse. Beside it go the two that
 * never go down — the longest run and the days learned in all — and the
 * freezes learning has earned, with what one costs.
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

/**
 * Which of the two day-count forms the flame label needs.
 *
 * It used to build the string — `${current} days` — which put English in a
 * pure module and on every profile in the app. The choice between one and many
 * is still this function's, because it is the only place that knows the number;
 * the words belong to the catalogue.
 */
export function streakLabelKey(current: number): 'streak.day' | 'streak.days' {
  return current === 1 ? 'streak.day' : 'streak.days';
}

/**
 * The flame reads as "lit" only while the run is alive. A zeroed streak
 * shows a cold flame to nudge the learner back.
 */
export function isFlameLit(current: number): boolean {
  return current > 0;
}
