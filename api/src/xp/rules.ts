/**
 * The XP rules: learning pays most, farming pays less. Every award yields two numbers. XP earned (`amount`) is the
 * learner's, moving level and badges; only one rule touches it: a lesson finished a third time in a day pays nothing.
 * XP counted (`counted`) is what the weekly league and board rank by, where farming is made not to pay: game XP counts
 * only up to 60 a day across all games, and a day's XP past 300 counts at half, past 600 at a fifth. Days are UTC
 * days, the league week's clock, so a day never straddles two weeks.
 */
import { ACCURACY_BONUS_XP, BASE_LESSON_XP, LEARN_GAME_XP_SOURCES, REPEAT_XP_FACTOR, RIDDLE_XP_SOURCE } from '@kurda/shared';

/** Learning: these join the week's league and build streaks (see `isLearningSource`). */
export const LEARNING_XP_SOURCES = ['lesson_complete', 'practice_complete', 'story'] as const;
/**
 * Game XP sources, all sharing one daily league cap. The learning games' sources come from their registry
 * (`LEARN_GAME_XP_SOURCES`), so a new game is capped from the day it is added. Only online games with other people pay
 * game XP; solo games no longer write to the ledger, but their sources stay because the ledger still holds what they
 * paid, which keeps counting under the cap. The lessons' own game exercises still pay from game sources. A riddle
 * solved by guessing before a reveal pays a little once (`riddle`, lore/riddles.ts), under the same cap.
 */
export const GAME_XP_SOURCES: readonly string[] = ['wordle', 'wordle_battle', 'rhyme', 'rhyme_match', 'race', RIDDLE_XP_SOURCE, ...LEARN_GAME_XP_SOURCES];

/** What a lesson pays (base, accuracy bonus and repeat share) lives in @kurda/shared, since the apps show it before a lesson. */
export { ACCURACY_BONUS_XP, BASE_LESSON_XP, REPEAT_XP_FACTOR };
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

/** Lesson completion XP: base plus accuracy bonus, reduced for a lesson completed before. */
export function lessonCompletionXp(accuracy: number, isRepeat: boolean): number {
  const clamped = Math.max(0, Math.min(1, accuracy));
  const base = BASE_LESSON_XP + Math.round(ACCURACY_BONUS_XP * clamped);
  return isRepeat ? Math.max(1, Math.round(base * REPEAT_XP_FACTOR)) : base;
}

export interface LessonHistory {
  /** Completions of this lesson before this one, ever. */
  priorCompletions: number;
  /** …of which today (UTC) */
  priorCompletionsToday: number;
}

/** Repeats of the lesson already finished today; when every earlier completion was today, the first was not a repeat. */
export function repeatsToday(history: LessonHistory): number {
  const { priorCompletions, priorCompletionsToday } = history;
  if (priorCompletionsToday <= 0) return 0;
  return priorCompletionsToday === priorCompletions ? priorCompletionsToday - 1 : priorCompletionsToday;
}

/**
 * XP for finishing a lesson: full the first time, a quarter for a repeat, nothing for a third repeat in a day. Practice
 * and review still pay their own amounts, so revisiting a lesson is never wrong; it just stops being a way to climb.
 */
export function lessonXp(accuracy: number, history: LessonHistory): number {
  const isRepeat = history.priorCompletions > 0;
  if (isRepeat && repeatsToday(history) >= PAID_LESSON_REPEATS_PER_DAY) return 0;
  return lessonCompletionXp(accuracy, isRepeat);
}

/** The counted value of a day's first `x` eligible XP: full to 300, half to 600, a fifth after; continuous, so splitting awards never changes the total. */
export function countedCurve(x: number): number {
  const full = Math.min(Math.max(x, 0), FULL_RATE_XP);
  const half = Math.min(Math.max(x - FULL_RATE_XP, 0), HALF_RATE_XP - FULL_RATE_XP);
  const late = Math.max(x - HALF_RATE_XP, 0);
  return full + half * HALF_RATE + late * LATE_RATE;
}

export interface DayXp {
  /** Game XP earned earlier today (gross, positive awards only). */
  gameToday: number;
  /** Every other XP earned earlier today. */
  otherToday: number;
}

/**
 * What an award counts for the league, given the day's earlier XP: game XP first meets its cap, then everything goes
 * along the daily curve. Rounded down so the day's counted total equals the curve at its eligible total.
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

/** SQL: the counted XP of ledger row `alias`; a row from before `counted` existed counts its positive amount. */
export function countedXpSql(alias: string): string {
  return `COALESCE(${alias}.counted, GREATEST(${alias}.amount, 0))`;
}
