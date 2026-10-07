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

/** Finished lessons and practice sessions that earn one streak freeze. */
export const SESSIONS_PER_FREEZE = 5;

/**
 * Whether a finished lesson or practice session was learning: at least half
 * of its items answered, and never fewer than one.
 *
 * Finishing is a request anyone can send, with nothing answered at all. Five
 * of those earned a streak freeze, and one unlocked the daily Zêr — exactly the
 * pay-for-showing-up the rewards were changed to avoid. Half rather than all,
 * because a learner may skip a speaking item (no microphone) or a listening one
 * whose audio would not load, and a lesson with a few of those is still a
 * lesson. A session that is not learning still finishes and still earns its
 * XP; it just does not count as a day learned, a day of the streak, a step
 * towards a freeze or the daily Zêr.
 */
export function countsAsLearning(answered: number, total: number): boolean {
  return answered >= Math.max(1, Math.ceil(total / 2));
}

/**
 * What learning has added up to, kept beside the streak rather than in it: the
 * streak can be broken, these only grow (or, for the freeze count, fill up).
 */
export interface LearningTally {
  /** distinct days with at least one finished lesson or practice session */
  daysLearned: number;
  /** the last such day, 'YYYY-MM-DD' in the user's tz, or null */
  lastLearnedOn: string | null;
  /** finished sessions towards the next freeze, 0..SESSIONS_PER_FREEZE */
  freezeProgress: number;
}

export const EMPTY_TALLY: LearningTally = { daysLearned: 0, lastLearnedOn: null, freezeProgress: 0 };

/**
 * Record one finished lesson or practice session on `today`.
 *
 * The day counts for the streak exactly as `record` would have it, and once
 * for the days-learned total. The session itself counts towards a freeze: the
 * fifth since the last one earns another, unless the user already holds the
 * most they may (MAX_FREEZES). Then the count waits, full, and the next session
 * after a freeze is spent earns it — so learning is never wasted, and nothing
 * can be stockpiled past the cap.
 */
export function recordSession(
  streak: StreakState,
  tally: LearningTally,
  today: string,
): { streak: StreakState; tally: LearningTally; incremented: boolean; freezeEarned: boolean } {
  const { state, incremented } = record(streak, today);
  const firstToday = tally.lastLearnedOn !== today;
  let freezeProgress = Math.min(SESSIONS_PER_FREEZE, tally.freezeProgress + 1);
  let next = state;
  let freezeEarned = false;
  if (freezeProgress >= SESSIONS_PER_FREEZE && state.freezes < MAX_FREEZES) {
    next = grantFreeze(state);
    freezeProgress = 0;
    freezeEarned = true;
  }
  return {
    streak: next,
    tally: {
      daysLearned: firstToday ? tally.daysLearned + 1 : tally.daysLearned,
      lastLearnedOn: today,
      freezeProgress,
    },
    incremented,
    freezeEarned,
  };
}
