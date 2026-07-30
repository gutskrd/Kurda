/**
 * Pure streak arithmetic (KUR-031). No database, no clock — every function
 * takes its inputs explicitly so the day-boundary and freeze rules can be
 * unit-tested exhaustively, including DST edges.
 */

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  /** calendar date 'YYYY-MM-DD' in the user's tz, or null if never active */
  lastActiveOn: string | null;
  /** stored streak freezes (0 or 1) */
  freezes: number;
}

export const MAX_FREEZES = 1;

/** The user's local calendar date for an instant, as 'YYYY-MM-DD'. */
export function localDate(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD; the tz makes it the user's calendar day,
  // so DST shifts never move the date boundary.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Whole days between two 'YYYY-MM-DD' dates (b - a), DST-immune. */
export function dayDiff(a: string, b: string): number {
  const toDayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
  return toDayNumber(b) - toDayNumber(a);
}

/** The calendar date `days` before `date` (negative = after). */
export function shiftDate(date: string, days: number): string {
  const base = Date.parse(`${date}T00:00:00Z`);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Bring a stored state up to `today` without counting today as activity:
 * a single missed day is covered by a freeze (consumed); any longer gap
 * breaks the run (current → 0, but the freeze and the true last-active
 * date are preserved). Idempotent for a given `today`.
 */
export function settle(state: StreakState, today: string): StreakState {
  if (state.lastActiveOn === null) return state;
  const gap = dayDiff(state.lastActiveOn, today);
  if (gap <= 1) return state; // active today or yesterday — run alive
  if (gap === 2 && state.freezes >= 1) {
    // one missed day, covered: advance the anchor to yesterday
    return { ...state, freezes: state.freezes - 1, lastActiveOn: shiftDate(today, -1) };
  }
  return { ...state, currentStreak: 0 }; // run broken
}

/**
 * Record a goal-meeting activity for `today`. Settles first, then counts
 * today at most once: consecutive day extends the run, any gap restarts
 * it at 1. Returns the new state and whether today newly counted.
 */
export function record(state: StreakState, today: string): { state: StreakState; incremented: boolean } {
  const settled = settle(state, today);
  if (settled.lastActiveOn === today) return { state: settled, incremented: false };

  let current: number;
  if (settled.lastActiveOn === null) {
    current = 1;
  } else {
    const gap = dayDiff(settled.lastActiveOn, today);
    current = gap === 1 && settled.currentStreak > 0 ? settled.currentStreak + 1 : 1;
  }
  return {
    state: {
      currentStreak: current,
      longestStreak: Math.max(settled.longestStreak, current),
      lastActiveOn: today,
      freezes: settled.freezes,
    },
    incremented: true,
  };
}

/** Grant a freeze, capped at MAX_FREEZES. Returns the (possibly unchanged) state. */
export function grantFreeze(state: StreakState): StreakState {
  return { ...state, freezes: Math.min(MAX_FREEZES, state.freezes + 1) };
}
