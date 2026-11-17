/** Course-map contract — mirrors the server (KUR-040). */

export type SkillState = 'locked' | 'unlocked' | 'completed' | 'gold' | 'decayed';

/** One lesson of a skill, as the map lists it. */
export interface LessonNode {
  lessonId: string;
  position: number;
  title: string;
  /** finished by this learner — this version of the lesson or an earlier one */
  completed: boolean;
  /** how many times they have finished it, replays included; absent on older responses */
  times?: number;
}

export interface SkillNode {
  skillId: string;
  level: number;
  title: string;
  state: SkillState;
  strength: number;
  hasGrammar: boolean;
  firstLessonId: string | null;
  /**
   * The skill's published lessons in order. The server always sends them;
   * optional so a map kept from before they were sent still reads.
   */
  lessons?: LessonNode[];
  /** full rounds of its lessons played (its stars) and its ring's pieces filled (shared `topicRounds`); absent on older responses */
  rounds?: number;
  pieces?: number;
}

export interface CourseUnit {
  unitId: string;
  title: string;
  skills: SkillNode[];
  /** the story that closes a chapter of the road, once learners can read it; absent on older responses */
  story?: { slug: string; title: string } | null;
  /** its level in the course plan ('A1'), which the path groups units into sections by; null or absent where there is none */
  level?: string | null;
}

/** The unit after the last one out, while it is being made; `recordedBy` names who records it (the road's are Hamo's). */
export interface UpcomingUnit {
  number: number;
  title: string;
  recordedBy: 'hamo' | null;
}

export interface CourseMap {
  course: { id: string; title: string };
  units: CourseUnit[];
  /** skills up to this place in the course are open because a test let the learner through; absent on older responses */
  unlockedThrough?: number;
  /** the unit the course goes on to once it is made; absent on older responses */
  upcoming?: UpcomingUnit | null;
}

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  dialect: string;
}
