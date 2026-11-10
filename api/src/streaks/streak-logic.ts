/**
 * Pure streak arithmetic (KUR-031). No database, no clock — every function
 * takes its inputs explicitly so the day-boundary and freeze rules can be
 * unit-tested exhaustively, including DST edges.
 *
 * It also remembers the run that last ended, so that it can be restored for a
 * few days afterwards (`restore`; the price and the days are the shared
 * streak-repair rules).
 */
import { repairOpen, type EndedStreak } from '@kurda/shared';

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  /** calendar date 'YYYY-MM-DD' in the user's tz, or null if never active */
  lastActiveOn: string | null;
  /** stored streak freezes: 0 up to the most this learner may hold (`maxFreezesFor`) */
  freezes: number;
  /**
   * The missed day the last freeze spent covered, 'YYYY-MM-DD' in the user's
   * tz, or null (or absent) if none ever has: what the apps say once, "your
   * streak was kept".
   */
  freezeUsedOn?: string | null;
  /**
   * How many days in a row, ending on `freezeUsedOn`, freezes kept: 1 unless a
   * learner holding two missed two days running. Absent reads as 1.
   */
  freezeUsedDays?: number;
  /**
   * The run that last ended, or null (or absent) if none has since this was
   * kept: its length, its last day, and whether it was restored.
   */
  ended?: EndedStreak | null;
}

export const MAX_FREEZES = 1;
/** A Hevalo+ member has room for a second freeze. */
export const PLUS_MAX_FREEZES = 2;

/** The most freezes a learner may hold at once. */
export function maxFreezesFor(plus: boolean): number {
  return plus ? PLUS_MAX_FREEZES : MAX_FREEZES;
}

/**
 * A zone Intl can use, or UTC. Sign-up once stored whatever string it was
 * sent, and an unknown zone made Intl throw — every lesson completion and the
 * daily reward then failed with a 500 for that learner, for good.
 */
export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

/** The user's local calendar date for an instant, as 'YYYY-MM-DD'. */
export function localDate(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD; the tz makes it the user's calendar day,
  // so DST shifts never move the date boundary.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone(timeZone),
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

/** The calendar date `days` after `date` (negative = before). */
export function shiftDate(date: string, days: number): string {
  const base = Date.parse(`${date}T00:00:00Z`);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The instant a calendar day begins in a time zone. Found by halving the
 * thirty hours around the day's UTC midnight (no zone is further from UTC than
 * that) rather than by subtracting an offset, so a day whose midnight a clock
 * change skips still begins at its first minute.
 */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const tz = safeTimeZone(timeZone);
  const minute = 60_000;
  let before = Date.parse(`${date}T00:00:00Z`) - 15 * 60 * minute; // still the day before, everywhere
  let from = before + 30 * 60 * minute; // already the day, everywhere
  while (from - before > minute) {
    const mid = before + Math.floor((from - before) / (2 * minute)) * minute;
    if (localDate(new Date(mid), tz) >= date) from = mid;
    else before = mid;
  }
  return new Date(from);
}

/**
 * Bring a stored state up to `today` without counting today as activity:
 * missed days are covered by freezes while there is one for each (consumed,
 * and the last day covered kept as `freezeUsedOn`); a gap longer than the
 * freezes held ends the run (current → 0, the freezes and the true last-active
 * date preserved, and the run kept as `ended` so it can be restored). A run
 * that has ended already is left as it is: there is nothing for a freeze to
 * keep. Idempotent for a given `today`.
 */
export function settle(state: StreakState, today: string): StreakState {
  if (state.lastActiveOn === null) return state;
  const gap = dayDiff(state.lastActiveOn, today);
  if (gap <= 1) return state; // active today or yesterday — run alive
  if (state.currentStreak <= 0) return state; // ended before: nothing to keep, nothing more to end
  const missed = gap - 1;
  if (missed <= state.freezes) {
    // every missed day covered: advance the anchor to yesterday, the last day a freeze kept
    const yesterday = shiftDate(today, -1);
    const joins = state.freezeUsedOn === state.lastActiveOn; // the day before these was kept by a freeze too
    return {
      ...state,
      freezes: state.freezes - missed,
      lastActiveOn: yesterday,
      freezeUsedOn: yesterday,
      freezeUsedDays: (joins ? (state.freezeUsedDays ?? 1) : 0) + missed,
    };
  }
  return { ...state, currentStreak: 0, ended: endRun(state, today) }; // run broken
}

/**
 * What is remembered of a run as it ends. Normally the run itself. But a short
 * run that ends while the streak before it can still be restored joins that
 * one instead of replacing it: the offer stays, with the days learned since
 * added to it, so restoring never costs a learner the days they came back for.
 * Its last day stays the first run's, so the offer ends when it always would
 * have.
 */
function endRun(state: StreakState, today: string): EndedStreak {
  const earlier = state.ended ?? null;
  if (earlier && repairOpen(earlier, today)) return { ...earlier, days: earlier.days + state.currentStreak };
  return { days: state.currentStreak, lastActiveOn: state.lastActiveOn!, restoredOn: null };
}

/**
 * Bring back the run that ended, on `today`. The caller has checked that it
 * can be (shared `repairStanding`) and has taken the price.
 *
 * The missed days are kept the way a freeze keeps a day: they add nothing to
 * the count and are not days learned, and the run goes on across them. With
 * nothing learned since, the count is the ended run's and its anchor moves to
 * yesterday, so a lesson today is its next day and the learner has today to do
 * one. With a run begun since and still alive, that run's days are added and
 * its anchor is kept: a day learned after the break is not lost. No freeze is
 * spent.
 */
export function restore(state: StreakState, today: string): StreakState {
  const settled = settle(state, today);
  const ended = settled.ended;
  if (!ended) return settled;
  const since = settled.currentStreak; // 0 unless a run begun after the break is alive
  const current = ended.days + since;
  return {
    ...settled,
    currentStreak: current,
    longestStreak: Math.max(settled.longestStreak, current),
    lastActiveOn: since > 0 ? settled.lastActiveOn : shiftDate(today, -1),
    ended: { ...ended, restoredOn: today },
  };
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
      ...settled,
      currentStreak: current,
      longestStreak: Math.max(settled.longestStreak, current),
      lastActiveOn: today,
    },
    incremented: true,
  };
}

/**
 * Grant a freeze, unless the learner already holds the most they may (`max`:
 * MAX_FREEZES, or a Hevalo+ member's two). Returns the (possibly unchanged)
 * state; one who holds more than the cap, a member whose membership ended,
 * keeps what they hold.
 */
export function grantFreeze(state: StreakState, max: number = MAX_FREEZES): StreakState {
  return state.freezes >= max ? state : { ...state, freezes: state.freezes + 1 };
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
/**
 * How many of a session's answers were given on the learner's today, in SQL.
 * `$1` is the session id, `$2` the time zone (pass it through safeTimeZone),
 * `$3` today's 'YYYY-MM-DD' — or the placeholders given, for a statement that
 * reads it beside something else. Learning is credited to the day it happened:
 * a sitting's answers kept in an open session and completed on later days
 * would otherwise buy a streak day and the daily Zêr on each of them.
 */
export function answeredTodaySql(
  table: 'session_answers' | 'practice_answers',
  at: { session: string; zone: string; day: string } = { session: '$1', zone: '$2', day: '$3' },
): string {
  return `SELECT count(*)::int n FROM ${table}
          WHERE session_id = ${at.session} AND (answered_at AT TIME ZONE ${at.zone})::date = ${at.day}::date`;
}

export function countsAsLearning(answered: number, total: number): boolean {
  return answered >= Math.max(1, Math.ceil(total / 2));
}

/** `countsAsLearning` in SQL, over two expressions of a statement that reads sessions. */
export function countsAsLearningSql(answered: string, total: string): string {
  return `${answered} >= GREATEST(1, ceil(${total} / 2.0))`;
}

/** Days the streak's recent days reach back, today included: two weeks, whatever day a learner's week starts on. */
export const RECENT_DAYS = 14;

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
 * most they may (`maxFreezes`). Then the count waits, full, and the next session
 * after a freeze is spent earns it — so learning is never wasted, and nothing
 * can be stockpiled past the cap.
 */
export function recordSession(
  streak: StreakState,
  tally: LearningTally,
  today: string,
  maxFreezes: number = MAX_FREEZES,
): { streak: StreakState; tally: LearningTally; incremented: boolean; freezeEarned: boolean } {
  const { state, incremented } = record(streak, today);
  const firstToday = tally.lastLearnedOn !== today;
  let freezeProgress = Math.min(SESSIONS_PER_FREEZE, tally.freezeProgress + 1);
  let next = state;
  let freezeEarned = false;
  if (freezeProgress >= SESSIONS_PER_FREEZE && state.freezes < maxFreezes) {
    next = grantFreeze(state, maxFreezes);
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
