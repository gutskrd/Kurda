/**
 * Pure streak arithmetic: every input is explicit, so day boundaries and freeze rules (DST edges included) are fully
 * unit-tested. It also remembers the run that last ended so it can be restored for a few days (`restore`; price and
 * days are the shared streak-repair rules).
 */
import { repairOpen, type EndedStreak } from '@kurda/shared';

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  /** calendar date 'YYYY-MM-DD' in the user's tz, or null if never active */
  lastActiveOn: string | null;
  /** stored streak freezes: 0 up to the most this learner may hold (`maxFreezesFor`) */
  freezes: number;
  /** The missed day the last freeze covered ('YYYY-MM-DD' in the user's zone), or null or absent if none, for the apps' one-time "your streak was kept". */
  freezeUsedOn?: string | null;
  /** How many consecutive days ending on `freezeUsedOn` freezes kept: 1 unless a learner holding two missed two days running. Absent reads as 1. */
  freezeUsedDays?: number;
  /** The run that last ended, or null or absent: its length, last day, and whether it was restored. */
  ended?: EndedStreak | null;
}

export const MAX_FREEZES = 1;
/** A Hevalo+ member has room for a second freeze. */
export const PLUS_MAX_FREEZES = 2;

/** The most freezes a learner may hold at once. */
export function maxFreezesFor(plus: boolean): number {
  return plus ? PLUS_MAX_FREEZES : MAX_FREEZES;
}

/** A zone Intl can use, else UTC; an unknown stored zone would otherwise make Intl throw on every lesson and reward. */
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
  // en-CA formats as YYYY-MM-DD, and the zone makes it the user's calendar day, so DST never moves the boundary.
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
 * The instant a calendar day begins in a zone, found by bisecting the thirty hours around the day's UTC midnight (no
 * zone is further from UTC) rather than subtracting an offset, so a day whose midnight a clock change skips still
 * begins at its first minute.
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
 * Brings a stored state up to `today` without counting today: missed days are covered while there is a freeze for
 * each (spent, with the last covered day kept as `freezeUsedOn`); a longer gap ends the run (current 0, freezes and the
 * last active date kept, and the run saved as `ended` for restoring). An already ended run is left alone. Idempotent
 * for a given `today`.
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
 * What is remembered of an ending run: normally the run itself, but a short run ending while the previous streak can
 * still be restored joins that offer instead, with its days added, so restoring never loses the days a learner came
 * back for. Its last day stays the first run's, so the offer ends on time.
 */
function endRun(state: StreakState, today: string): EndedStreak {
  const earlier = state.ended ?? null;
  if (earlier && repairOpen(earlier, today)) return { ...earlier, days: earlier.days + state.currentStreak };
  return { days: state.currentStreak, lastActiveOn: state.lastActiveOn!, restoredOn: null };
}

/**
 * Brings back the ended run on `today`; the caller has checked it can (`repairStanding`) and taken the price. The
 * missed days are kept as a freeze keeps a day: no count and not learned, but the run continues across them. With
 * nothing learned since, the count is the ended run's and its anchor moves to yesterday, so today's lesson is its next
 * day. With a newer live run, its days are added and its anchor kept. No freeze is spent.
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
 * Records a goal-meeting activity for `today`: settles first, then counts today at most once, a consecutive day
 * extending the run and any gap restarting it at 1. Returns the new state and whether today newly counted.
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
 * Grants a freeze unless the learner already holds `max` (MAX_FREEZES, or two for a Hevalo+ member). A learner above
 * the cap, such as a former member, keeps what they hold.
 */
export function grantFreeze(state: StreakState, max: number = MAX_FREEZES): StreakState {
  return state.freezes >= max ? state : { ...state, freezes: state.freezes + 1 };
}

/** Finished lessons and practice sessions that earn one streak freeze. */
export const SESSIONS_PER_FREEZE = 5;

/**
 * How many of a session's answers were given on the learner's today, in SQL: `$1` the session id, `$2` the time zone
 * (passed through safeTimeZone), `$3` today's 'YYYY-MM-DD', or the given placeholders. Learning is credited to the day
 * it happened, so answers kept in an open session cannot buy a streak day and Zêr on each later day.
 */
export function answeredTodaySql(
  table: 'session_answers' | 'practice_answers',
  at: { session: string; zone: string; day: string } = { session: '$1', zone: '$2', day: '$3' },
): string {
  return `SELECT count(*)::int n FROM ${table}
          WHERE session_id = ${at.session} AND (answered_at AT TIME ZONE ${at.zone})::date = ${at.day}::date`;
}

/**
 * Whether a finished lesson or practice session was learning: at least half its items answered, and at least one.
 * Finishing is a request anyone can send with nothing answered, and must not earn freezes or the daily Zêr. Half,
 * because a learner may skip a speaking item or a listening one whose audio failed. A session that is not learning
 * still finishes and earns its XP, but is not a learning day, a streak day, a step toward a freeze or the daily Zêr.
 */
export function countsAsLearning(answered: number, total: number): boolean {
  return answered >= Math.max(1, Math.ceil(total / 2));
}

/** `countsAsLearning` in SQL, over two expressions of a statement that reads sessions. */
export function countsAsLearningSql(answered: string, total: string): string {
  return `${answered} >= GREATEST(1, ceil(${total} / 2.0))`;
}

/** Days the recent-days list reaches back, today included: two weeks, whatever day a week starts on. */
export const RECENT_DAYS = 14;

/** What learning has added up to, kept beside the streak: the streak can break, these only grow (or, for freezes, fill up). */
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
 * Records one finished lesson or practice session on `today`: the streak day as `record` counts it, once for days
 * learned, and one step toward a freeze; every fifth earns one unless the learner holds `maxFreezes`, when the count
 * waits full and the next session after a freeze is spent earns it. Learning is never wasted and nothing stockpiles.
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
