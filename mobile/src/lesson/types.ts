/** Lesson-player contract — mirrors the server payloads (KUR-028/#28). */
import type { DeliveredExercise, GradeResult, RecordedAnswer, Verdict } from '@kurda/shared';

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
}

export interface SessionResults {
  correct: number;
  total: number;
  accuracy: number;
  /** what was missed, with the question and its right answer (a lesson's results; practice has none) */
  mistakes?: Array<{ exerciseId: string; verdict: Verdict; prompt?: string; correction?: string }>;
  xpAwarded: number;
  streak: Streak;
}
