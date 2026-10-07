/**
 * What the learning endpoints send, as the browser reads it. The shapes are
 * the API's own (api/src/coursemap/service.ts, content/sessions.ts,
 * practice/service.ts); what is about playing a session — the delivered
 * exercise, a graded answer — comes from @kurda/shared, which the phone uses
 * too.
 */
import type { DeliveredExercise, GradeResult, RecordedAnswer, Verdict } from '@kurda/shared';

/** GET /courses */
export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  /** 'kurmanji', 'sorani', … */
  dialect: string;
}

export type SkillState = 'locked' | 'unlocked' | 'completed' | 'gold' | 'decayed';

export interface LessonNode {
  lessonId: string;
  position: number;
  title: string;
  /** finished by this learner — this version of the lesson or an earlier one */
  completed: boolean;
}

export interface SkillNode {
  skillId: string;
  level: number;
  title: string;
  state: SkillState;
  /** 0–100 */
  strength: number;
  hasGrammar: boolean;
  firstLessonId: string | null;
  lessons: LessonNode[];
}

/** GET /courses/:id/map */
export interface CourseMap {
  course: { id: string; title: string };
  units: Array<{ unitId: string; title: string; skills: SkillNode[] }>;
}

/** GET /lessons/:id/session — a lesson's session, new or resumed */
export interface LessonSessionView {
  sessionId: string;
  lessonId: string;
  expiresAt: string;
  completed: boolean;
  exercises: DeliveredExercise[];
  answered: Record<string, RecordedAnswer>;
  grammarMd: string | null;
  dialect: string | null;
}

/** GET /practice/sessions/:id, and POST /practice/session when there is something to practise */
export interface PracticeSessionView {
  sessionId: string;
  exercises: DeliveredExercise[];
  answered?: Record<string, RecordedAnswer>;
  completed?: boolean;
}

/** POST /practice/session when there is nothing to practise */
export interface EmptyPractice {
  empty: true;
  suggestion: { lessonId: string; title: string } | null;
}

/** GET /practice/due */
export interface PracticeDue {
  due: number;
  available: number;
}

export interface Mistake {
  exerciseId: string;
  verdict: Verdict;
  prompt?: string;
  correction?: string;
}

export interface Streak {
  current: number;
  longest: number;
}

/** POST …/complete — a lesson's results carry `firstCompletion`, practice's do not */
export interface SessionResults {
  correct: number;
  total: number;
  accuracy: number;
  mistakes?: Mistake[];
  xpAwarded: number;
  streak: Streak;
  firstCompletion?: boolean;
}

/** POST …/answers */
export interface AnswerResult extends GradeResult {
  duplicate: boolean;
}

/** POST …/retry: graded, never recorded */
export type RetryResult = Omit<GradeResult, 'duplicate'>;
