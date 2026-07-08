/** Lesson-player contract — mirrors the server payloads (KUR-028/#28). */

export type ExerciseType = 'multiple_choice' | 'translate' | 'match_pairs' | 'listening' | 'speaking';
export type Verdict = 'correct' | 'typo' | 'wrong';

/** An exercise as delivered to the client: answer keys stripped server-side. */
export interface Exercise {
  id: string;
  position: number;
  type: ExerciseType;
  prompt?: string;
  options?: string[];
  lefts?: string[];
  rights?: string[];
  /** listening (KUR-035): CDN url of the clip to play */
  audioUrl?: string;
}

export interface SessionView {
  sessionId: string;
  lessonId: string;
  expiresAt: string;
  completed: boolean;
  exercises: Exercise[];
  answered: Record<string, { verdict: Verdict; accepted: boolean }>;
}

export interface AnswerResult {
  verdict: Verdict;
  accepted: boolean;
  correction?: string;
  duplicate: boolean;
}

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
  mistakes: Array<{ exerciseId: string; verdict: Verdict }>;
  xpAwarded: number;
  streak: Streak;
}

/** A pair the learner matched, sent to the server for grading. */
export interface MatchPair {
  left: string;
  right: string;
}
