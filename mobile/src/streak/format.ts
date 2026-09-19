/** Streak display helpers (KUR-031). Pure so they can be unit-tested. */

export interface Streak {
  current: number;
  longest: number;
  freezes: number;
  lastActiveOn: string | null;
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
