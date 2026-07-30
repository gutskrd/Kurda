/** Streak display helpers (KUR-031). Pure so they can be unit-tested. */

export interface Streak {
  current: number;
  longest: number;
  freezes: number;
  lastActiveOn: string | null;
}

/** "1 day" / "N days" — singular-aware count for the flame label. */
export function streakLabel(current: number): string {
  return `${current} ${current === 1 ? 'day' : 'days'}`;
}

/**
 * The flame reads as "lit" only while the run is alive. A zeroed streak
 * shows a cold flame to nudge the learner back.
 */
export function isFlameLit(current: number): boolean {
  return current > 0;
}
