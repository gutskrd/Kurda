/**
 * What the learning endpoints send (api/src/coursemap/service.ts, content/sessions.ts, practice/service.ts); session
 * play shapes come from @kurda/shared, as on the phone.
 */
import type { DeliveredExercise, GradeResult, QuestStep, RecentDay, RecordedAnswer, Verdict } from '@kurda/shared';

/** GET /courses. */
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
  /** Finished by this learner, this version of the lesson or an earlier one. */
  completed: boolean;
  /** Times finished, replays included (absent from an older server). */
  times?: number;
}

export interface SkillNode {
  skillId: string;
  level: number;
  title: string;
  state: SkillState;
  /** 0–100. */
  strength: number;
  hasGrammar: boolean;
  firstLessonId: string | null;
  lessons: LessonNode[];
  /** Full rounds played (its stars), by the shared rule; absent from an older server. */
  rounds?: number;
  pieces?: number;
}

/** GET /courses/:id/map. */
export interface CourseMap {
  course: { id: string; title: string };
  /**
   * Up to the last unit with a lesson out; each chapter with its closing story once readable, and its course-plan level
   * ('A1'), by which the path groups units into sections.
   */
  units: Array<{ unitId: string; title: string; skills: SkillNode[]; story?: { slug: string; title: string } | null; level?: string | null }>;
  /** The unit after the last one out, while being made; `recordedBy` names who records it (Hamo on the road). */
  upcoming?: { number: number; title: string; recordedBy: 'hamo' | null } | null;
}

/** GET /lessons/:id/session: a lesson's session, new or resumed. */
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

/** GET /practice/sessions/:id, and POST /practice/session when there is something to practise. */
export interface PracticeSessionView {
  sessionId: string;
  exercises: DeliveredExercise[];
  answered?: Record<string, RecordedAnswer>;
  completed?: boolean;
}

/** POST /practice/session when there is nothing to practise. */
export interface EmptyPractice {
  empty: true;
  suggestion: { lessonId: string; title: string } | null;
}

/** GET /practice/due. */
export interface PracticeDue {
  due: number;
  available: number;
  /** A review started in the last day and left unfinished, to go back to. */
  open?: string | null;
}

export interface Mistake {
  exerciseId: string;
  verdict: Verdict;
  prompt?: string;
  correction?: string;
}

/** The streak as a session's results give it (api/src/streaks/service.ts `StreakSummary`). */
export interface Streak {
  current: number;
  longest: number;
  /** The last day that counted (always sent by the server; older test data may lack it). */
  lastActiveOn?: string | null;
  /** Freezes held, each covering one missed day. */
  freezes?: number;
  /** Days with a finished lesson or practice, ever; a missed day never takes one away. */
  daysLearned?: number;
  /** Finished sessions towards the next freeze, of `sessionsPerFreeze`. */
  freezeProgress?: number;
  sessionsPerFreeze?: number;
  /** The learner's own today (YYYY-MM-DD, their time zone), to lay out the week. */
  today?: string;
  /** Days in their last 14 on which they learned or a freeze kept the streak. */
  recent?: RecentDay[];
}

/** POST …/complete; a lesson's results carry `firstCompletion`, practice's do not. */
export interface SessionResults {
  correct: number;
  total: number;
  accuracy: number;
  mistakes?: Mistake[];
  xpAwarded: number;
  streak: Streak;
  firstCompletion?: boolean;
  /** Today's quests this session moved, before and after (absent when none moved, or on an older server). */
  quests?: QuestStep[];
  /** Water this session earned the learner's tree, and their total (absent when none, or on an older server). */
  tree?: { gained: number; water: number };
}

/** POST …/answers. */
export interface AnswerResult extends GradeResult {
  duplicate: boolean;
}

/** POST …/retry: graded, never recorded. */
export type RetryResult = Omit<GradeResult, 'duplicate'>;
