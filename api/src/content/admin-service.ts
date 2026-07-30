import type pg from 'pg';
import { validateExercisePayload, InvalidExercisePayloadError } from './exercises.js';
import { ContentRepository, type ExerciseType } from './repository.js';
import type { ContentStatus } from './workflow.js';

export interface ExerciseInput {
  position: number;
  type: ExerciseType;
  payload: unknown;
}

export interface LessonDetail {
  id: string;
  skillId: string;
  position: number;
  version: number;
  status: ContentStatus;
  titleKu: string;
  titleEn: string;
  lockVersion: number;
  exercises: Array<{ position: number; type: ExerciseType; payload: unknown }>;
}

type UpdateResult =
  | { ok: true; lockVersion: number }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_EDITABLE' | 'CONFLICT' }
  | { ok: false; code: 'INVALID'; issues: Array<{ path: string; message: string }> };

type TransitionResult = { ok: true } | { ok: false; code: 'NOT_FOUND' | 'BAD_STATE' };

interface LessonRow {
  id: string;
  skill_id: string;
  position: number;
  version: number;
  status: ContentStatus;
  title_ku: string;
  title_en: string;
  lock_version: number;
}

/**
 * Admin content management (KUR-100). Editors author drafts here with the SAME
 * validation the import pipeline uses (`validateExercisePayload`), move them
 * through draft → in_review → published, and are protected from clobbering each
 * other by an optimistic `lock_version`. Published lessons are immutable (DB
 * trigger); "editing" a published lesson clones a fresh draft version.
 */
export class ContentAdminService {
  private readonly repo: ContentRepository;
  constructor(private readonly pool: pg.Pool) {
    this.repo = new ContentRepository(pool);
  }

  /** Start a new draft lesson at a (skill, position) slot. */
  async createDraft(
    skillId: string,
    position: number,
    titleKu: string,
    titleEn: string,
  ): Promise<{ lessonId: string }> {
    const lessonId = await this.repo.createLessonVersion(skillId, position, titleKu, titleEn);
    return { lessonId };
  }

  /** Full editable view of a lesson (for the editor), including its lock version. */
  async getLesson(lessonId: string): Promise<LessonDetail | null> {
    const res = await this.pool.query<LessonRow>(
      `SELECT id, skill_id, position, version, status, title_ku, title_en, lock_version
       FROM lessons WHERE id = $1`,
      [lessonId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const ex = await this.pool.query<{ position: number; type: ExerciseType; payload: unknown }>(
      `SELECT position, type, payload FROM exercises WHERE lesson_id = $1 ORDER BY position`,
      [lessonId],
    );
    return {
      id: row.id,
      skillId: row.skill_id,
      position: row.position,
      version: row.version,
      status: row.status,
      titleKu: row.title_ku,
      titleEn: row.title_en,
      lockVersion: row.lock_version,
      exercises: ex.rows,
    };
  }

  /**
   * Replace a draft's titles + exercises. Validates every exercise up front
   * (import-pipeline parity), then commits under an optimistic-lock check:
   * a stale `expectedLock` is rejected as a CONFLICT rather than overwriting a
   * concurrent editor's work.
   */
  async updateDraft(
    lessonId: string,
    input: { titleKu: string; titleEn: string; exercises: ExerciseInput[] },
    expectedLock: number,
  ): Promise<UpdateResult> {
    // validate before touching the DB, mirroring the import pipeline
    const issues: Array<{ path: string; message: string }> = [];
    input.exercises.forEach((ex, i) => {
      try {
        validateExercisePayload(ex.type, ex.payload);
      } catch (err) {
        if (err instanceof InvalidExercisePayloadError) {
          for (const d of err.issues) issues.push({ path: `exercises[${i}].${d.path}`, message: d.message });
        } else {
          issues.push({ path: `exercises[${i}]`, message: (err as Error).message });
        }
      }
    });
    if (issues.length > 0) return { ok: false, code: 'INVALID', issues };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query<{ lock_version: number }>(
        `UPDATE lessons SET title_ku = $2, title_en = $3, lock_version = lock_version + 1
         WHERE id = $1 AND status = 'draft' AND lock_version = $4
         RETURNING lock_version`,
        [lessonId, input.titleKu, input.titleEn, expectedLock],
      );
      if (updated.rowCount === 0) {
        const cur = await client.query<{ status: ContentStatus }>(`SELECT status FROM lessons WHERE id = $1`, [lessonId]);
        await client.query('ROLLBACK');
        if (cur.rowCount === 0) return { ok: false, code: 'NOT_FOUND' };
        if (cur.rows[0]!.status !== 'draft') return { ok: false, code: 'NOT_EDITABLE' };
        return { ok: false, code: 'CONFLICT' };
      }
      await client.query(`DELETE FROM exercises WHERE lesson_id = $1`, [lessonId]);
      for (const ex of input.exercises) {
        const validated = validateExercisePayload(ex.type, ex.payload);
        await client.query(
          `INSERT INTO exercises (lesson_id, position, type, payload) VALUES ($1, $2, $3, $4)`,
          [lessonId, ex.position, ex.type, JSON.stringify(validated)],
        );
      }
      await client.query('COMMIT');
      return { ok: true, lockVersion: updated.rows[0]!.lock_version };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** draft → in_review. */
  submit(lessonId: string): Promise<TransitionResult> {
    return this.transition(lessonId, 'draft', "status = 'in_review'");
  }

  /** in_review → published (records published_at). */
  approve(lessonId: string): Promise<TransitionResult> {
    return this.transition(lessonId, 'in_review', "status = 'published', published_at = now()");
  }

  /** in_review → draft (send back for changes). */
  reject(lessonId: string): Promise<TransitionResult> {
    return this.transition(lessonId, 'in_review', "status = 'draft'");
  }

  /** Clone a published lesson as a fresh draft version for editing. */
  async editPublished(lessonId: string): Promise<{ ok: true; lessonId: string } | { ok: false; code: 'NOT_FOUND' | 'BAD_STATE' }> {
    const cur = await this.pool.query<{ status: ContentStatus }>(`SELECT status FROM lessons WHERE id = $1`, [lessonId]);
    if (cur.rowCount === 0) return { ok: false, code: 'NOT_FOUND' };
    if (cur.rows[0]!.status !== 'published') return { ok: false, code: 'BAD_STATE' };
    const newId = await this.repo.newLessonVersion(lessonId);
    return { ok: true, lessonId: newId };
  }

  private async transition(lessonId: string, from: ContentStatus, setClause: string): Promise<TransitionResult> {
    const res = await this.pool.query(
      `UPDATE lessons SET ${setClause} WHERE id = $1 AND status = $2`,
      [lessonId, from],
    );
    if ((res.rowCount ?? 0) > 0) return { ok: true };
    const exists = await this.pool.query(`SELECT 1 FROM lessons WHERE id = $1`, [lessonId]);
    return { ok: false, code: exists.rowCount === 0 ? 'NOT_FOUND' : 'BAD_STATE' };
  }
}
