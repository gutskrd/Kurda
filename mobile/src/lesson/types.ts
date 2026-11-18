/** Lesson-player contract, mirroring the server payloads. */
import type { DeliveredExercise, GradeResult, QuestStep, RecentDay, RecordedAnswer, Verdict } from '@kurda/shared';

export type { ExerciseType, MatchPair, SelfRating, Verdict } from '@kurda/shared';

/** An exercise as delivered to the client, with answer keys stripped server-side. */
export type Exercise = DeliveredExercise;

export interface SessionView {
  sessionId: string;
  lessonId: string;
  expiresAt: string;
  completed: boolean;
  exercises: Exercise[];
  answered: Record<string, RecordedAnswer>;
  /** Markdown grammar note for this lesson's skill, if any. */
  grammarMd?: string | null;
  /** The course's variety of Kurdish; absent on a practice session. */
  dialect?: string | null;
}

/** An answer as `/answers` grades it. */
export interface AnswerResult extends GradeResult {
  duplicate: boolean;
}

/** A second try at a missed item, as `/retry` grades it; never recorded. */
export type RetryResult = Omit<GradeResult, 'duplicate'>;

export interface Streak {
  current: number;
  longest: number;
  freezes: number;
  lastActiveOn: string | null;
  /** Total days learned, which never goes down (api/src/streaks/service.ts `StreakSummary`). */
  daysLearned?: number;
  /** Finished sessions towards the next freeze, out of `sessionsPerFreeze`. */
  freezeProgress?: number;
  sessionsPerFreeze?: number;
  /** The learner's today (YYYY-MM-DD, their timezone), to lay out the week; absent on an older server. */
  today?: string;
  /** Days in the learner's last 14 with learning or a freeze; absent on an older server. */
  recent?: RecentDay[];
}

export interface SessionResults {
  correct: number;
  total: number;
  accuracy: number;
  /** What was missed, with the question and its right answer (lesson results and reviews alike). */
  mistakes?: Array<{ exerciseId: string; verdict: Verdict; prompt?: string; correction?: string }>;
  xpAwarded: number;
  streak: Streak;
  /** A jump-ahead test's outcome. */
  jump?: JumpOutcome;
  /** Today's quests this session moved, before and after; absent when none moved or on an older server. */
  quests?: QuestStep[];
  /** Water this session earned the learner's tree, and their total; absent when none or on an older server. */
  tree?: { gained: number; water: number };
}

/** A jump-ahead test's outcome, as the server decided it (api/src/jump/settle.ts). */
export interface JumpOutcome {
  unitId: string;
  passed: boolean;
  /** Right the first time, of every item asked. */
  correct: number;
  total: number;
  mistakesAllowed: number;
}
