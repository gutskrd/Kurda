/**
 * What else a finished lesson did — today's goal, the streak, a new level —
 * decided by the rules in @kurda/shared (lesson-moments.ts), which the
 * browser's player uses too.
 */
export {
  NO_LESSON_MOMENTS as NO_MOMENTS,
  anyLessonMoment as anyMoment,
  lessonMoments,
  type LessonMoments,
  type LessonStanding as Standing,
  type LessonStreakMark as StreakMark,
} from '@kurda/shared';
