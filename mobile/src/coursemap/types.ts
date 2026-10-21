/** Course-map contract — mirrors the server (KUR-040). */

export type SkillState = 'locked' | 'unlocked' | 'completed' | 'gold' | 'decayed';

/** One lesson of a skill, as the map lists it. */
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
  strength: number;
  hasGrammar: boolean;
  firstLessonId: string | null;
  /**
   * The skill's published lessons in order. The server always sends them;
   * optional so a map kept from before they were sent still reads.
   */
  lessons?: LessonNode[];
}

export interface CourseUnit {
  unitId: string;
  title: string;
  skills: SkillNode[];
}

export interface CourseMap {
  course: { id: string; title: string };
  units: CourseUnit[];
}

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  dialect: string;
}
