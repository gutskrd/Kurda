import type pg from 'pg';
import { skillStrength } from '../placement/skill-strength.js';
import { isUnlocked, skillState, type SkillState } from './node-state.js';

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  dialect: string;
}

/** One lesson in a skill, as the map lists it. */
export interface LessonNode {
  lessonId: string;
  position: number;
  title: string;
  /** this learner has finished this lesson — this version or an earlier one */
  completed: boolean;
}

export interface SkillNode {
  skillId: string;
  level: number;
  title: string;
  state: SkillState;
  strength: number;
  hasGrammar: boolean;
  /** first incomplete published lesson to launch (or null if none published) */
  firstLessonId: string | null;
  /** the skill's published lessons in order, so a map can show each one */
  lessons: LessonNode[];
}

export interface CourseMap {
  course: { id: string; title: string };
  units: Array<{ unitId: string; title: string; skills: SkillNode[] }>;
}

interface SkillRow {
  skill_id: string;
  skill_title: string;
  has_grammar: boolean;
  unit_id: string;
  unit_title: string;
}

/** Course map with per-skill lock/complete/gold/decay state (KUR-040). */
export class CourseMapService {
  constructor(private readonly pool: pg.Pool) {}

  /** Courses that have at least one published lesson. */
  async listCourses(): Promise<CourseSummary[]> {
    const res = await this.pool.query<{ id: string; slug: string; title_en: string; dialect: string }>(
      `SELECT DISTINCT c.id, c.slug, c.title_en, c.dialect
       FROM courses c
       JOIN units u ON u.course_id = c.id
       JOIN skills s ON s.unit_id = u.id
       JOIN lessons l ON l.skill_id = s.id AND l.status = 'published'
       ORDER BY c.slug ASC`,
    );
    return res.rows.map((r) => ({ id: r.id, slug: r.slug, title: r.title_en, dialect: r.dialect }));
  }

  async forUser(userId: string, courseId: string): Promise<CourseMap | null> {
    const course = await this.pool.query<{ title_en: string }>(
      `SELECT title_en FROM courses WHERE id = $1`,
      [courseId],
    );
    if (course.rowCount === 0) return null;

    const [skills, lessons, completed, reviews, progress] = await Promise.all([
      this.pool.query<SkillRow>(
        `SELECT s.id skill_id, s.title_en skill_title, (s.grammar_md IS NOT NULL) has_grammar,
                u.id unit_id, u.title_en unit_title
         FROM skills s JOIN units u ON u.id = s.unit_id
         WHERE u.course_id = $1
         ORDER BY u.position ASC, s.position ASC`,
        [courseId],
      ),
      // the learner-visible published lesson per (skill, position)
      this.pool.query<{ id: string; skill_id: string; position: number; title_en: string }>(
        `SELECT DISTINCT ON (l.skill_id, l.position) l.id, l.skill_id, l.position, l.title_en
         FROM lessons l JOIN skills s ON s.id = l.skill_id JOIN units u ON u.id = s.unit_id
         WHERE u.course_id = $1 AND l.status = 'published'
         ORDER BY l.skill_id, l.position, l.version DESC`,
        [courseId],
      ),
      // finished lessons by place, not by row: a corrected version of a lesson
      // is a new row at the same place, and to the learner who finished the
      // old one it is still the lesson they finished (as `LessonSlot` in
      // content/sessions.ts) — keyed by row, a content fix re-locked the rest
      // of the course behind a lesson they had already done
      this.pool.query<{ skill_id: string; position: number }>(
        `SELECT DISTINCT l.skill_id, l.position
         FROM lesson_sessions ls JOIN lessons l ON l.id = ls.lesson_id
         WHERE ls.user_id = $1 AND ls.completed_at IS NOT NULL`,
        [userId],
      ),
      this.pool.query<{ skill_id: string; easiness: number; repetitions: number }>(
        `SELECT l.skill_id, r.easiness, r.repetitions
         FROM review_items r
         JOIN exercises e ON e.id::text = r.item_id
         JOIN lessons l ON l.id = e.lesson_id
         JOIN skills s ON s.id = l.skill_id JOIN units u ON u.id = s.unit_id
         WHERE r.user_id = $1 AND u.course_id = $2`,
        [userId, courseId],
      ),
      this.pool.query<{ unlocked_through_position: number }>(
        `SELECT unlocked_through_position FROM user_course_progress WHERE user_id = $1 AND course_id = $2`,
        [userId, courseId],
      ),
    ]);

    const doneSlots = new Set(completed.rows.map((r) => `${r.skill_id}:${r.position}`));
    const lessonsBySkill = new Map<string, LessonNode[]>();
    for (const l of lessons.rows) {
      const list = lessonsBySkill.get(l.skill_id) ?? [];
      list.push({
        lessonId: l.id,
        position: l.position,
        title: l.title_en,
        completed: doneSlots.has(`${l.skill_id}:${l.position}`),
      });
      lessonsBySkill.set(l.skill_id, list);
    }
    const reviewsBySkill = new Map<string, Array<{ easiness: number; repetitions: number }>>();
    for (const r of reviews.rows) {
      const list = reviewsBySkill.get(r.skill_id) ?? [];
      list.push({ easiness: r.easiness, repetitions: r.repetitions });
      reviewsBySkill.set(r.skill_id, list);
    }
    const unlockedThrough = progress.rows[0]?.unlocked_through_position ?? 0;

    const units: CourseMap['units'] = [];
    let previousCompleted = false;
    skills.rows.forEach((s, i) => {
      const level = i + 1;
      const skillLessons = (lessonsBySkill.get(s.skill_id) ?? []).sort((a, b) => a.position - b.position);
      const completedSkill = skillLessons.length > 0 && skillLessons.every((l) => l.completed);
      const firstIncomplete = skillLessons.find((l) => !l.completed);
      const strength = skillStrength(reviewsBySkill.get(s.skill_id) ?? []);
      const unlocked = isUnlocked(level, previousCompleted, unlockedThrough);

      const node: SkillNode = {
        skillId: s.skill_id,
        level,
        title: s.skill_title,
        state: skillState({ unlocked, completed: completedSkill, strength }),
        strength,
        hasGrammar: s.has_grammar,
        firstLessonId: firstIncomplete?.lessonId ?? skillLessons[0]?.lessonId ?? null,
        lessons: skillLessons,
      };

      let unit = units.find((u) => u.unitId === s.unit_id);
      if (!unit) {
        unit = { unitId: s.unit_id, title: s.unit_title, skills: [] };
        units.push(unit);
      }
      unit.skills.push(node);
      previousCompleted = completedSkill;
    });

    return { course: { id: courseId, title: course.rows[0]!.title_en }, units };
  }
}
