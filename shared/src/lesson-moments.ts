/**
 * What else a finished lesson did, beside the lesson itself: met today's goal,
 * kept the streak going for today, reached a new level.
 *
 * The server's results say how the lesson went and where the streak now
 * stands; whether any of this just *happened* is what changed between before
 * the lesson and after it. So the player — the phone's and the browser's
 * alike — notes where things stood as the lesson opened, asks again as it
 * closes, and these rules compare the two. A number that could not be read
 * either time is a moment not claimed — never a guess that turns into a
 * celebration for nothing.
 *
 * All of them are celebrated together on the results, felt once.
 */

export interface LessonStreakMark {
  current: number;
  lastActiveOn: string | null;
}

/** Where things stood, as read from `/me` and `/me/daily-goal`; null where it could not be read. */
export interface LessonStanding {
  level: number | null;
  goalCompleted: boolean | null;
  streak: LessonStreakMark | null;
}

export interface LessonMoments {
  /** today's goal was not met before this lesson and is now */
  goalMet: boolean;
  /** the streak counted today for the first time with this lesson */
  streakKept: boolean;
  /** the level reached, when this lesson reached a new one */
  level: number | null;
}

export const NO_LESSON_MOMENTS: LessonMoments = { goalMet: false, streakKept: false, level: null };

export function lessonMoments(before: LessonStanding | null, after: LessonStanding | null, streakNow: LessonStreakMark | null): LessonMoments {
  if (!before) return NO_LESSON_MOMENTS;
  const goalMet = before.goalCompleted === false && after?.goalCompleted === true;
  const streakKept =
    before.streak !== null &&
    streakNow !== null &&
    streakNow.current > 0 &&
    streakNow.lastActiveOn !== null &&
    streakNow.lastActiveOn !== before.streak.lastActiveOn;
  const level =
    before.level !== null && after?.level != null && after.level > before.level ? after.level : null;
  return { goalMet, streakKept, level };
}

/** Whether anything beside the lesson is worth a word on the results. */
export function anyLessonMoment(m: LessonMoments): boolean {
  return m.goalMet || m.streakKept || m.level !== null;
}
