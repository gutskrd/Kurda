/** What finishing a lesson pays, shared by the API's XP rules (api/src/xp/rules.ts) and the "+10–20 XP" a path stop shows, so they cannot drift. */

export const BASE_LESSON_XP = 10;
/** Accuracy adds up to this on top of the base, so a perfect lesson pays base plus this. */
export const ACCURACY_BONUS_XP = 10;
/** Repeats of an already-completed lesson pay this fraction, so lessons cannot be farmed. */
export const REPEAT_XP_FACTOR = 0.25;
/**
 * Finishes of one story's quiz that still pay in a day (at the repeat rate once the story was ever finished); the next
 * pays nothing, like a lesson's third repeat. Shared so the reader can say so before the quiz starts.
 */
export const PAID_STORY_REPEATS_PER_DAY = 2;

/**
 * The least and most a lesson pays, from none right to all right, first time or repeated (the server rounds a repeat the
 * same way). A third repeat in a day pays nothing, which a stop's card does not promise either way.
 */
export function lessonXpRange(repeat: boolean): { min: number; max: number } {
  const min = BASE_LESSON_XP;
  const max = BASE_LESSON_XP + ACCURACY_BONUS_XP;
  if (!repeat) return { min, max };
  return { min: Math.max(1, Math.round(min * REPEAT_XP_FACTOR)), max: Math.max(1, Math.round(max * REPEAT_XP_FACTOR)) };
}
