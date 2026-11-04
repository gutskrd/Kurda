/**
 * What finishing a lesson pays, in the numbers the server pays by and the
 * apps show before a lesson is opened ("+10–20 XP" on a path's stop). Here so
 * the two cannot drift apart: the API's XP rules (api/src/xp/rules.ts) import
 * them rather than keeping a copy.
 */

export const BASE_LESSON_XP = 10;
/** Accuracy adds up to this on top of the base (perfect lesson = base + this). */
export const ACCURACY_BONUS_XP = 10;
/** Repeats of an already-completed lesson pay this fraction (anti-farm). */
export const REPEAT_XP_FACTOR = 0.25;
/**
 * Finishes of one story's quiz that still pay in a day (the first at the
 * repeat rate once the story was ever finished); the next pays nothing, as a
 * lesson's third repeat does. Shared so the reader can say so before the quiz
 * is started, with the same number the server pays by.
 */
export const PAID_STORY_REPEATS_PER_DAY = 2;

/**
 * The least and the most a lesson pays: from none right to all right, the
 * first time through or again (the server rounds a repeat as it does here).
 * A third repeat in a day pays nothing, which a stop's card does not promise
 * either way, so it is left out.
 */
export function lessonXpRange(repeat: boolean): { min: number; max: number } {
  const min = BASE_LESSON_XP;
  const max = BASE_LESSON_XP + ACCURACY_BONUS_XP;
  if (!repeat) return { min, max };
  return { min: Math.max(1, Math.round(min * REPEAT_XP_FACTOR)), max: Math.max(1, Math.round(max * REPEAT_XP_FACTOR)) };
}
