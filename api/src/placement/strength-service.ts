import type pg from 'pg';
import { skillStrength } from './skill-strength.js';

export interface SkillStrength {
  skillId: string;
  level: number;
  title: string;
  /** 0–100 */
  strength: number;
  /** tested-out or progressed past this skill */
  unlocked: boolean;
}

/**
 * Per-skill strength for a course (KUR-039), computed on demand from the
 * learner's spaced-repetition state over each skill's exercises, plus the
 * course's unlocked-through level from placement/progress.
 */
export class SkillStrengthService {
  constructor(private readonly pool: pg.Pool) {}

  async forCourse(userId: string, courseId: string): Promise<SkillStrength[]> {
    const [skills, reviews, progress] = await Promise.all([
      this.pool.query<{ id: string; title_en: string }>(
        `SELECT s.id, s.title_en FROM skills s
         JOIN units u ON u.id = s.unit_id
         WHERE u.course_id = $1
         ORDER BY u.position ASC, s.position ASC`,
        [courseId],
      ),
      // review state for every exercise, tagged with its skill
      this.pool.query<{ skill_id: string; easiness: number; repetitions: number }>(
        `SELECT l.skill_id, r.easiness, r.repetitions
         FROM review_items r
         JOIN exercises e ON e.id::text = r.item_id
         JOIN lessons l ON l.id = e.lesson_id
         JOIN skills s ON s.id = l.skill_id
         JOIN units u ON u.id = s.unit_id
         WHERE r.user_id = $1 AND u.course_id = $2`,
        [userId, courseId],
      ),
      this.pool.query<{ unlocked_through_position: number }>(
        `SELECT unlocked_through_position FROM user_course_progress WHERE user_id = $1 AND course_id = $2`,
        [userId, courseId],
      ),
    ]);

    const bySkill = new Map<string, Array<{ easiness: number; repetitions: number }>>();
    for (const r of reviews.rows) {
      const list = bySkill.get(r.skill_id) ?? [];
      list.push({ easiness: r.easiness, repetitions: r.repetitions });
      bySkill.set(r.skill_id, list);
    }
    const unlockedThrough = progress.rows[0]?.unlocked_through_position ?? 0;

    return skills.rows.map((s, i) => ({
      skillId: s.id,
      level: i + 1,
      title: s.title_en,
      strength: skillStrength(bySkill.get(s.id) ?? []),
      unlocked: i + 1 <= unlockedThrough,
    }));
  }
}
