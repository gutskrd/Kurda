/** Lesson-player contract — mirrors the server payloads (KUR-028/#28). */
import type { DeliveredExercise, GradeResult, QuestStep, RecentDay, RecordedAnswer, Verdict } from '@kurda/shared';

export type { ExerciseType, MatchPair, SelfRating, Verdict } from '@kurda/shared';

/** An exercise as delivered to the client: answer keys stripped server-side. */
export type Exercise = DeliveredExercise;

export interface SessionView {
  sessionId: string;
  lessonId: string;
  expiresAt: string;
  completed: boolean;
  exercises: Exercise[];
  answered: Record<string, RecordedAnswer>;
  /** markdown grammar note for this lesson's skill, if any (KUR-038) */
  grammarMd?: string | null;
  /** the course's variety of Kurdish; absent on a practice session */
  dialect?: string | null;
}

/** An answer as `/answers` grades it. */
export interface AnswerResult extends GradeResult {
  duplicate: boolean;
}

/** A second try at a missed item, as `/retry` grades it: never recorded. */
export type RetryResult = Omit<GradeResult, 'duplicate'>;

export interface Streak {
  current: number;
  longest: number;
  freezes: number;
  lastActiveOn: string | null;
  /** days learned in all, which never go down (api/src/streaks/service.ts `StreakSummary`) */
  daysLearned?: number;
  /** finished sessions towards the next freeze, out of `sessionsPerFreeze` */
  freezeProgress?: number;
  sessionsPerFreeze?: number;
  /** the learner's own today (YYYY-MM-DD, their timezone), to lay out the week; absent on an older server */
  today?: string;
  /** days in the last 14 (theirs) on which they learned, or a freeze kept the streak; absent on an older server */
  recent?: RecentDay[];
}

export interface SessionResults {
  correct: number;
  total: number;
  accuracy: number;
  /** what was missed, with the question and its right answer (a lesson's results and a review's alike) */
  mistakes?: Array<{ exerciseId: string; verdict: Verdict; prompt?: string; correction?: string }>;
  xpAwarded: number;
  streak: Streak;
  /** a test to jump ahead on the path: how it came out */
  jump?: JumpOutcome;
  /** today's quests this session moved, before and after (absent when none moved, or on an older server) */
  quests?: QuestStep[];
}

/** How a test to jump ahead came out, as the server decided it (api/src/jump/settle.ts). */
export interface JumpOutcome {
  unitId: string;
  passed: boolean;
  /** right the first time, of every item asked */
  correct: number;
  total: number;
  mistakesAllowed: number;
}
