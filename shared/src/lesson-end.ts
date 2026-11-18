/** What follows a lesson's last answer, alike on both apps: the sitting's time and pace, Hevalo's words on a kept streak, and the moments after the results. */

import { resultsGrade } from './lesson-moments.js';

/** What the results' title says: a perfect lesson, a great one (first-time right often enough that the grade is not `practice`), or done. */
export type ResultsOutcome = 'perfect' | 'great' | 'done';

export function resultsOutcome({ perfect, accuracy }: { perfect: boolean; accuracy: number }): ResultsOutcome {
  if (perfect) return 'perfect';
  return resultsGrade(accuracy) === 'practice' ? 'done' : 'great';
}

/** A sitting's time as minutes and whole seconds, for an m:ss clock. */
export function sittingClock(ms: number): { minutes: number; seconds: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

/** A sitting is quick at no more than this per answer on average, over at least a few answers. */
export const QUICK_PACE = { msPerAnswer: 10_000, minAnswers: 3 } as const;

/** Whether the time card calls the sitting quick, or simply says how long it took; never slow, since a learner's own pace is not marked down. */
export function sittingPace(ms: number, answers: number): 'quick' | 'steady' {
  return answers >= QUICK_PACE.minAnswers && ms <= answers * QUICK_PACE.msPerAnswer ? 'quick' : 'steady';
}

/**
 * The day a streak was kept, for Hevalo's words: the first day of a run (`start`), the first again after missed days by
 * someone who learned before (`comeback`), the longest run yet (`best`), or any other day (`ordinary`). Only what the
 * server said decides; a comeback is never guessed.
 */
export type StreakMood = 'start' | 'comeback' | 'best' | 'ordinary';

export function streakMood(streak: { current: number; longest: number; daysLearned?: number }): StreakMood {
  if (streak.current <= 1) return (streak.daysLearned ?? 0) > 1 || streak.longest > 1 ? 'comeback' : 'start';
  return streak.current >= streak.longest ? 'best' : 'ordinary';
}

/** Hevalo's line: the mood and which of its two lines, so two days running are not told the same thing. */
export function streakSpeech(streak: { current: number; longest: number; daysLearned?: number }): { mood: StreakMood; line: 0 | 1 } {
  return { mood: streakMood(streak), line: Math.abs(streak.current) % 2 === 0 ? 0 : 1 };
}

/**
 * What follows the results, in order, each shown once: the streak's moment when this lesson kept it, today's quests when
 * it moved any, and last, when due on the phone (`remindersDue`), the screen saying what Hevalo would send before the
 * phone asks about notifications, so the lesson's own moments never wait behind a question.
 */
export type AfterResults = 'streak' | 'quests' | 'reminders';

export function afterResults({
  streakKept,
  questsMoved,
  remindersDue = false,
}: {
  streakKept: boolean;
  questsMoved: boolean;
  remindersDue?: boolean;
}): AfterResults[] {
  return [...(streakKept ? (['streak'] as const) : []), ...(questsMoved ? (['quests'] as const) : []), ...(remindersDue ? (['reminders'] as const) : [])];
}
