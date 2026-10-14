import type pg from 'pg';
import { validateExercisePayload, InvalidExercisePayloadError } from './exercises.js';
import { ContentRepository, type ExerciseType } from './repository.js';
import type { ContentStatus } from './workflow.js';
import { silentListening, type SilentListening } from '../lessonaudio/publish-guard.js';

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
  /** where the lesson sits, so the editor can say so without a second request */
  skillTitle: string;
  unitTitle: string;
  courseTitle: string;
}

type UpdateResult =
  | { ok: true; lockVersion: number }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_EDITABLE' | 'CONFLICT' }
  | { ok: false; code: 'INVALID'; issues: Array<{ path: string; message: string }> };

type TransitionResult =
  | { ok: true }
  | { ok: false; code: 'NOT_FOUND' | 'BAD_STATE' }
  /** approving would publish a listening item with nothing to play */
  | { ok: false; code: 'LISTENING_AUDIO_MISSING'; silent: SilentListening[] };

/**
 * One lesson slot (a skill's position) in the admin's lesson list: its newest
 * version, where it sits in the course, and — when that newest version is a
 * draft or in review — the version learners are on today.
 */
export interface LessonListItem {
  id: string;
  skillId: string;
  position: number;
  version: number;
  status: ContentStatus;
  titleKu: string;
  titleEn: string;
  exerciseCount: number;
  createdAt: Date;
  publishedAt: Date | null;
  /** the published version of this slot, when it is not this row (a newer draft is being written) */
  liveId: string | null;
  course: { id: string; title: string };
  unit: { id: string; title: string; position: number };
  skill: { id: string; title: string; position: number };
}

/** A skill a new lesson can be added to, with the next free position in it. */
export interface SkillOption {
  id: string;
  titleEn: string;
  titleKu: string;
  unitTitle: string;
  courseTitle: string;
  nextPosition: number;
}

export interface LessonListFilters {
  /** the newest version's status; omitted lists everything but archived slots */
  status?: ContentStatus | 'all';
  /** words of a title (Kurdish or English, the lesson's, skill's or unit's), or a lesson id */
  q?: string;
  limit?: number;
}

/** Most lessons a list answers with: the whole curriculum today is a few hundred. */
export const LESSON_LIST_MAX = 500;

interface LessonRow {
  id: string;
  skill_id: string;
  position: number;
  version: number;
  status: ContentStatus;
  title_ku: string;
  title_en: string;
  lock_version: number;
  skill_title: string;
  unit_title: string;
  course_title: string;
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

  /**
   * Every lesson slot, newest version first per slot, in course order — what
   * the admin's Lessons page lists, so an editor picks a lesson by its title
   * rather than pasting its id. Each slot appears once: the version an editor
   * would open (a draft of the next version, say), with the live version's id
   * beside it when that is a different row.
   */
  async listLessons(filters: LessonListFilters = {}): Promise<{ lessons: LessonListItem[]; total: number }> {
    const params: unknown[] = [];
    const where: string[] = [];
    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      where.push(`l.status = $${params.length}`);
    } else if (!filters.status) {
      where.push(`l.status <> 'archived'`);
    }
    const q = filters.q?.trim();
    if (q) {
      // a pasted id finds its lesson whichever version it names
      params.push(q.toLowerCase());
      const idAt = params.length;
      params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      const like = params.length;
      where.push(
        `(l.title_en ILIKE $${like} OR l.title_ku ILIKE $${like} OR s.title_en ILIKE $${like} OR s.title_ku ILIKE $${like}
          OR u.title_en ILIKE $${like}
          OR EXISTS (SELECT 1 FROM lessons v WHERE v.skill_id = l.skill_id AND v.position = l.position AND v.id::text = $${idAt}))`,
      );
    }
    const limit = Math.min(Math.max(filters.limit ?? LESSON_LIST_MAX, 1), LESSON_LIST_MAX);
    params.push(limit);
    const res = await this.pool.query<{
      id: string; skill_id: string; position: number; version: number; status: ContentStatus;
      title_ku: string; title_en: string; created_at: Date; published_at: Date | null; exercise_count: number;
      live_id: string | null; course_id: string; course_title: string; unit_id: string; unit_title: string;
      unit_position: number; skill_title: string; skill_position: number; total: number;
    }>(
      `WITH latest AS (
         SELECT DISTINCT ON (skill_id, position) * FROM lessons ORDER BY skill_id, position, version DESC
       ), live AS (
         SELECT DISTINCT ON (skill_id, position) id, skill_id, position FROM lessons
          WHERE status = 'published' ORDER BY skill_id, position, version DESC
       )
       SELECT l.id, l.skill_id, l.position, l.version, l.status, l.title_ku, l.title_en, l.created_at, l.published_at,
              (SELECT count(*)::int FROM exercises e WHERE e.lesson_id = l.id) AS exercise_count,
              CASE WHEN live.id = l.id THEN NULL ELSE live.id END AS live_id,
              c.id AS course_id, c.title_en AS course_title, u.id AS unit_id, u.title_en AS unit_title,
              u.position AS unit_position, s.title_en AS skill_title, s.position AS skill_position,
              count(*) OVER ()::int AS total
         FROM latest l
         JOIN skills s ON s.id = l.skill_id
         JOIN units u ON u.id = s.unit_id
         JOIN courses c ON c.id = u.course_id
         LEFT JOIN live ON live.skill_id = l.skill_id AND live.position = l.position
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY c.slug, u.position, s.position, l.position
        LIMIT $${params.length}`,
      params,
    );
    return {
      total: res.rows[0]?.total ?? 0,
      lessons: res.rows.map((r) => ({
        id: r.id,
        skillId: r.skill_id,
        position: r.position,
        version: r.version,
        status: r.status,
        titleKu: r.title_ku,
        titleEn: r.title_en,
        exerciseCount: r.exercise_count,
        createdAt: r.created_at,
        publishedAt: r.published_at,
        liveId: r.live_id,
        course: { id: r.course_id, title: r.course_title },
        unit: { id: r.unit_id, title: r.unit_title, position: r.unit_position },
        skill: { id: r.skill_id, title: r.skill_title, position: r.skill_position },
      })),
    };
  }

  /** The skills a new lesson can go in, in course order, each with its next free position. */
  async skillOptions(): Promise<SkillOption[]> {
    const res = await this.pool.query<{
      id: string; title_en: string; title_ku: string; unit_title: string; course_title: string; next_position: number;
    }>(
      `SELECT s.id, s.title_en, s.title_ku, u.title_en AS unit_title, c.title_en AS course_title,
              COALESCE((SELECT max(l.position) FROM lessons l WHERE l.skill_id = s.id), 0)::int + 1 AS next_position
         FROM skills s
         JOIN units u ON u.id = s.unit_id
         JOIN courses c ON c.id = u.course_id
        ORDER BY c.slug, u.position, s.position`,
    );
    return res.rows.map((r) => ({
      id: r.id,
      titleEn: r.title_en,
      titleKu: r.title_ku,
      unitTitle: r.unit_title,
      courseTitle: r.course_title,
      nextPosition: r.next_position,
    }));
  }

  /** Full editable view of a lesson (for the editor), including its lock version. */
  async getLesson(lessonId: string): Promise<LessonDetail | null> {
    const res = await this.pool.query<LessonRow>(
      `SELECT l.id, l.skill_id, l.position, l.version, l.status, l.title_ku, l.title_en, l.lock_version,
              s.title_en AS skill_title, u.title_en AS unit_title, c.title_en AS course_title
         FROM lessons l
         JOIN skills s ON s.id = l.skill_id
         JOIN units u ON u.id = s.unit_id
         JOIN courses c ON c.id = u.course_id
        WHERE l.id = $1`,
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
      skillTitle: row.skill_title,
      unitTitle: row.unit_title,
      courseTitle: row.course_title,
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

  /**
   * in_review → published (records published_at) — unless a listening item in
   * it has no clip of its own and its transcription is not recorded yet: it
   * would reach learners with nothing to play (lessonaudio/publish-guard.ts).
   * The lesson row and the recordings it relies on stay locked until the
   * commit, so neither can change between the check and the publish.
   */
  async approve(lessonId: string): Promise<TransitionResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query<{ status: ContentStatus }>(`SELECT status FROM lessons WHERE id = $1 FOR UPDATE`, [lessonId]);
      if (cur.rowCount === 0 || cur.rows[0]!.status !== 'in_review') {
        await client.query('ROLLBACK');
        return { ok: false, code: cur.rowCount === 0 ? 'NOT_FOUND' : 'BAD_STATE' };
      }
      const exercises = await client.query<{ type: ExerciseType; payload: unknown }>(
        `SELECT type, payload FROM exercises WHERE lesson_id = $1 ORDER BY position`,
        [lessonId],
      );
      const silent = await silentListening(client, exercises.rows, { lock: true });
      if (silent.length > 0) {
        await client.query('ROLLBACK');
        return { ok: false, code: 'LISTENING_AUDIO_MISSING', silent };
      }
      await client.query(`UPDATE lessons SET status = 'published', published_at = now() WHERE id = $1`, [lessonId]);
      await client.query('COMMIT');
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
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
