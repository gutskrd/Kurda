/**
 * The XP rules, all in one place (contract 4 §L4): learning pays most, farming
 * pays less.
 *
 * Two numbers come out of every award. The XP *earned* (`amount` in the
 * ledger) is the learner's: it moves their level and their badges, and only
 * one rule here touches it — a lesson finished a third time in a day pays
 * nothing, which is the anti-farm rule Brilliant found works best. The XP
 * *counted* (`counted`) is what the weekly league and the weekly board rank by,
 * and it is where farming is made not to pay: game XP counts only up to 60 a
 * day across every game, and a day's XP past 300 counts at half, past 600 at a
 * fifth. Somebody who plays all evening still levels up; they just cannot buy
 * a promotion with it.
 *
 * Days here are UTC days, the same clock as the league week, so a day never
 * straddles two weeks.
 */

/** Learning: these join the week's league and build streaks (see `isLearningSource`). */
export const LEARNING_XP_SOURCES = ['lesson_complete', 'practice_complete', 'story'] as const;
/** Games: rated or friendly, solo or not — all of them share one daily league cap. */
export const GAME_XP_SOURCES = ['wordle', 'wordle_battle', 'rhyme', 'rhyme_match', 'race'] as const;

export const BASE_LESSON_XP = 10;
/** Accuracy adds up to this on top of the base (perfect lesson = base + this). */
export const ACCURACY_BONUS_XP = 10;
/** Repeats of an already-completed lesson pay this fraction (anti-farm). */
export const REPEAT_XP_FACTOR = 0.25;
/** Repeats of one lesson that still pay in a day; the next one pays nothing. */
export const PAID_LESSON_REPEATS_PER_DAY = 2;

/** Game XP that counts for the league in a day, all games together. */
export const GAME_XP_LEAGUE_CAP = 60;
/** A day's counted XP is full up to this… */
export const FULL_RATE_XP = 300;
/** …at `HALF_RATE` up to this, and at `LATE_RATE` past it. */
export const HALF_RATE_XP = 600;
export const HALF_RATE = 0.5;
export const LATE_RATE = 0.2;

export function isLearningSource(source: string): boolean {
  return (LEARNING_XP_SOURCES as readonly string[]).includes(source);
}

export function isGameSource(source: string): boolean {
  return (GAME_XP_SOURCES as readonly string[]).includes(source);
}

/**
 * Lesson-completion XP: base + accuracy bonus, decayed to a fraction when the
 * learner has completed this lesson before (KUR-030).
 */
export function lessonCompletionXp(accuracy: number, isRepeat: boolean): number {
  const clamped = Math.max(0, Math.min(1, accuracy));
  const base = BASE_LESSON_XP + Math.round(ACCURACY_BONUS_XP * clamped);
  return isRepeat ? Math.max(1, Math.round(base * REPEAT_XP_FACTOR)) : base;
}

export interface LessonHistory {
  /** completions of this lesson before this one, ever */
  priorCompletions: number;
  /** …of which today (UTC) */
  priorCompletionsToday: number;
}

/**
 * Repeats of the lesson already finished today. When every earlier completion
 * was today, the first of them was the first time through, not a repeat.
 */
export function repeatsToday(history: LessonHistory): number {
  const { priorCompletions, priorCompletionsToday } = history;
  if (priorCompletionsToday <= 0) return 0;
  return priorCompletionsToday === priorCompletions ? priorCompletionsToday - 1 : priorCompletionsToday;
}

/**
 * XP for finishing a lesson: full the first time, a quarter for a repeat, and
 * nothing for a third repeat in a day — practice and review still pay their own
 * amounts, so going over a lesson again is never the wrong thing to do, it just
 * stops being a way to climb.
 */
export function lessonXp(accuracy: number, history: LessonHistory): number {
  const isRepeat = history.priorCompletions > 0;
  if (isRepeat && repeatsToday(history) >= PAID_LESSON_REPEATS_PER_DAY) return 0;
  return lessonCompletionXp(accuracy, isRepeat);
}

/**
 * The counted value of a day's first `x` eligible XP: full to 300, half to
 * 600, a fifth after. Continuous, so splitting a day into more awards never
 * changes its total.
 */
export function countedCurve(x: number): number {
  const full = Math.min(Math.max(x, 0), FULL_RATE_XP);
  const half = Math.min(Math.max(x - FULL_RATE_XP, 0), HALF_RATE_XP - FULL_RATE_XP);
  const late = Math.max(x - HALF_RATE_XP, 0);
  return full + half * HALF_RATE + late * LATE_RATE;
}

export interface DayXp {
  /** game XP earned earlier today (gross, positive awards only) */
  gameToday: number;
  /** every other XP earned earlier today */
  otherToday: number;
}

/**
 * What an award counts for the league, given what was earned earlier the same
 * day. Game XP first meets its own cap; what is left, with everything else,
 * goes along the daily curve. Rounded down so the day's counted total is
 * exactly the curve's value at the day's eligible total, however it is split.
 */
export function countedXp(source: string, amount: number, day: DayXp): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const gameBefore = Math.min(Math.max(day.gameToday, 0), GAME_XP_LEAGUE_CAP);
  const eligibleBefore = Math.max(day.otherToday, 0) + gameBefore;
  const eligible = isGameSource(source)
    ? Math.min(Math.max(day.gameToday, 0) + amount, GAME_XP_LEAGUE_CAP) - gameBefore
    : amount;
  return Math.floor(countedCurve(eligibleBefore + eligible)) - Math.floor(countedCurve(eligibleBefore));
}

/** SQL: the counted XP of ledger row `alias` (a row from before `counted` counts as its positive amount). */
export function countedXpSql(alias: string): string {
  return `COALESCE(${alias}.counted, GREATEST(${alias}.amount, 0))`;
}
