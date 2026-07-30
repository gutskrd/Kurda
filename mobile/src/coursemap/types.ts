/** Course-map contract — mirrors the server (KUR-040). */

export type SkillState = 'locked' | 'unlocked' | 'completed' | 'gold' | 'decayed';

export interface SkillNode {
  skillId: string;
  level: number;
  title: string;
  state: SkillState;
  strength: number;
  hasGrammar: boolean;
  firstLessonId: string | null;
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
