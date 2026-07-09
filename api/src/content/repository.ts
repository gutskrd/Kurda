import type pg from 'pg';
import { validateExercisePayload } from './exercises.js';

export type ExerciseType =
  | 'multiple_choice'
  | 'translate'
  | 'match_pairs'
  | 'listening'
  | 'speaking'
  | 'writing';
export type LessonStatus = 'draft' | 'published' | 'archived';

export interface LessonRow {
  id: string;
  skill_id: string;
  position: number;
  version: number;
  status: LessonStatus;
  title_ku: string;
  title_en: string;
}

/**
 * Authoring-side content operations (KUR-026). The import pipeline
 * (#41) and admin CMS (#100) sit on top of this; learner-facing reads
 * live with lesson delivery (#28).
 */
export class ContentRepository {
  constructor(private readonly pool: pg.Pool) {}

  async createCourse(input: {
    slug: string;
    dialect?: string;
    titleKu: string;
    titleEn: string;
  }): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO courses (slug, dialect, title_ku, title_en)
       VALUES ($1, COALESCE($2, 'kurmanji'), $3, $4) RETURNING id`,
      [input.slug, input.dialect ?? null, input.titleKu, input.titleEn],
    );
    return (result.rows[0] as { id: string }).id;
  }

  async createUnit(courseId: string, position: number, titleKu: string, titleEn: string): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO units (course_id, position, title_ku, title_en)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [courseId, position, titleKu, titleEn],
    );
    return (result.rows[0] as { id: string }).id;
  }

  async createSkill(unitId: string, position: number, titleKu: string, titleEn: string): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO skills (unit_id, position, title_ku, title_en)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [unitId, position, titleKu, titleEn],
    );
    return (result.rows[0] as { id: string }).id;
  }

  async createLesson(skillId: string, position: number, titleKu: string, titleEn: string): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO lessons (skill_id, position, title_ku, title_en)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [skillId, position, titleKu, titleEn],
    );
    return (result.rows[0] as { id: string }).id;
  }

  async addExercise(
    lessonId: string,
    position: number,
    type: ExerciseType,
    payload: Record<string, unknown>,
  ): Promise<string> {
    // reject malformed exercises at authoring time (KUR-027)
    const validated = validateExercisePayload(type, payload);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO exercises (lesson_id, position, type, payload)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [lessonId, position, type, JSON.stringify(validated)],
    );
    return (result.rows[0] as { id: string }).id;
  }

  async publishLesson(lessonId: string): Promise<void> {
    await this.pool.query(
      `UPDATE lessons SET status = 'published', published_at = now()
       WHERE id = $1 AND status = 'draft'`,
      [lessonId],
    );
  }

  /**
   * Editing published content: clone the lesson (+exercises) as a new
   * draft version at the same (skill, position). The old version stays
   * untouched — sessions pinned to it are unaffected.
   */
  async newLessonVersion(lessonId: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const cloned = await client.query<{ id: string }>(
        `INSERT INTO lessons (skill_id, position, version, status, title_ku, title_en)
         SELECT skill_id, position,
                (SELECT max(version) + 1 FROM lessons l2
                 WHERE l2.skill_id = lessons.skill_id AND l2.position = lessons.position),
                'draft', title_ku, title_en
         FROM lessons WHERE id = $1
         RETURNING id`,
        [lessonId],
      );
      const newId = (cloned.rows[0] as { id: string }).id;
      await client.query(
        `INSERT INTO exercises (lesson_id, position, type, payload)
         SELECT $2, position, type, payload FROM exercises WHERE lesson_id = $1`,
        [lessonId, newId],
      );
      await client.query('COMMIT');
      return newId;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** The learner-visible lesson: highest published version at a slot. */
  async publishedLesson(skillId: string, position: number): Promise<LessonRow | null> {
    const result = await this.pool.query<LessonRow>(
      `SELECT id, skill_id, position, version, status, title_ku, title_en
       FROM lessons
       WHERE skill_id = $1 AND position = $2 AND status = 'published'
       ORDER BY version DESC LIMIT 1`,
      [skillId, position],
    );
    return result.rows[0] ?? null;
  }
}
