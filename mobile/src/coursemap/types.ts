/** Course-map contract, mirroring the server. */

export type SkillState = 'locked' | 'unlocked' | 'completed' | 'gold' | 'decayed';

/** One lesson of a skill, as the map lists it. */
interface LessonNode {
  lessonId: string;
  position: number;
  title: string;
  /** Finished by this learner, in this version of the lesson or an earlier one. */
  completed: boolean;
  /** Times finished, replays included; absent on older responses. */
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
  /** Published lessons in order. Optional so a map cached before the server sent them still reads. */
  lessons?: LessonNode[];
  /** Full rounds played (its stars) and ring pieces filled (shared `topicRounds`); absent on older responses. */
  rounds?: number;
  pieces?: number;
}

interface CourseUnit {
  unitId: string;
  title: string;
  skills: SkillNode[];
  /** The readable story that closes a chapter; absent on older responses. */
  story?: { slug: string; title: string } | null;
  /** Its CEFR level in the course plan ('A1'), which groups units into sections; null or absent where there is none. */
  level?: string | null;
}

/** The next unit, still being made; `recordedBy` names its narrator. */
export interface UpcomingUnit {
  number: number;
  title: string;
  recordedBy: 'hamo' | null;
}

export interface CourseMap {
  course: { id: string; title: string };
  units: CourseUnit[];
  /** Skills up to this point are open because the learner passed a jump test; absent on older responses. */
  unlockedThrough?: number;
  /** The unit the course continues with once it is made; absent on older responses. */
  upcoming?: UpcomingUnit | null;
}

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  dialect: string;
}
