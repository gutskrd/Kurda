/** Content schema + versioning invariants (KUR-026) against Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ContentRepository } from './repository.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('content schema (integration)', () => {
  let pool: pg.Pool;
  let repo: ContentRepository;
  const suffix = Date.now().toString(36);
  let courseId: string;
  let skillId: string;
  let lessonV1: string;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);
  });

  afterAll(async () => {
    await pool.query(
      `UPDATE lessons SET status = 'archived'
       WHERE status = 'published' AND skill_id IN (
         SELECT s.id FROM skills s
         JOIN units u ON u.id = s.unit_id
         WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
  });

  it('builds the full Kurmanji hierarchy', async () => {
    courseId = await repo.createCourse({
      slug: `kurmanji-${suffix}`,
      titleKu: 'Kurmancî',
      titleEn: 'Kurmanji',
    });
    const unitId = await repo.createUnit(courseId, 1, 'Destpêk', 'Basics');
    skillId = await repo.createSkill(unitId, 1, 'Silavkirin', 'Greetings');
    lessonV1 = await repo.createLesson(skillId, 1, 'Silav 1', 'Greetings 1');
    await repo.addExercise(lessonV1, 1, 'multiple_choice', {
      prompt: '"Silav" bi îngilîzî çi ye?',
      options: ['Hello', 'Goodbye', 'Please', 'Thanks'],
      correctIndex: 0,
    });
    await repo.addExercise(lessonV1, 2, 'translate', {
      prompt: 'Ez baş im',
      accepted: ['I am fine', 'I am well'],
    });

    const course = await pool.query(`SELECT dialect FROM courses WHERE id = $1`, [courseId]);
    expect(course.rows[0].dialect).toBe('kurmanji');
  });

  it('unique positions are enforced per level', async () => {
    await expect(repo.createLesson(skillId, 1, 'Dupe', 'Dupe')).rejects.toThrow(/duplicate key/);
  });

  it('published lessons become immutable at the database level', async () => {
    await repo.publishLesson(lessonV1);
    await expect(
      pool.query(`UPDATE lessons SET title_en = 'Hacked' WHERE id = $1`, [lessonV1]),
    ).rejects.toThrow(/immutable/);
    await expect(pool.query(`DELETE FROM lessons WHERE id = $1`, [lessonV1])).rejects.toThrow(
      /immutable/,
    );
    await expect(
      pool.query(
        `UPDATE exercises SET payload = '{}'::jsonb WHERE lesson_id = $1`,
        [lessonV1],
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      repo.addExercise(lessonV1, 3, 'translate', { prompt: 'x', accepted: ['y'] }),
    ).rejects.toThrow(/immutable/);
  });

  it('editing means a new draft version; the old version survives untouched', async () => {
    const lessonV2 = await repo.newLessonVersion(lessonV1);
    const v2 = await pool.query(
      `SELECT version, status FROM lessons WHERE id = $1`,
      [lessonV2],
    );
    expect(v2.rows[0]).toEqual({ version: 2, status: 'draft' });

    // exercises cloned and editable on the draft
    const cloned = await pool.query(
      `SELECT count(*)::int AS n FROM exercises WHERE lesson_id = $1`,
      [lessonV2],
    );
    expect(cloned.rows[0].n).toBe(2);
    await pool.query(
      `UPDATE exercises SET payload = jsonb_set(payload, '{prompt}', '"Rojbaş"')
       WHERE lesson_id = $1 AND position = 1`,
      [lessonV2],
    );

    // learners see v1 until v2 publishes; then v2 — v1 rows still intact
    expect((await repo.publishedLesson(skillId, 1))?.id).toBe(lessonV1);
    await repo.publishLesson(lessonV2);
    expect((await repo.publishedLesson(skillId, 1))?.id).toBe(lessonV2);
    const v1 = await pool.query(`SELECT status, title_en FROM lessons WHERE id = $1`, [lessonV1]);
    expect(v1.rows[0]).toEqual({ status: 'published', title_en: 'Greetings 1' });
  });

  it('archiving a published version is the one allowed transition', async () => {
    await expect(
      pool.query(`UPDATE lessons SET status = 'archived' WHERE id = $1`, [lessonV1]),
    ).resolves.toBeDefined();
    const archived = await pool.query(`SELECT status FROM lessons WHERE id = $1`, [lessonV1]);
    expect(archived.rows[0].status).toBe('archived');
  });

  it('exercise types are constrained to the v1 set', async () => {
    const draft = await repo.createLesson(skillId, 9, 'Draft', 'Draft');
    // rejected by payload validation (KUR-027) before hitting the DB
    await expect(
      repo.addExercise(draft, 1, 'speaking' as never, { prompt: 'x' }),
    ).rejects.toThrow(/unknown exercise type/i);
  });

  it('rejects a malformed payload for a valid type (KUR-027)', async () => {
    const draft = await repo.createLesson(skillId, 10, 'Draft2', 'Draft2');
    await expect(
      repo.addExercise(draft, 1, 'multiple_choice', { prompt: 'x', options: ['a'], correctIndex: 3 }),
    ).rejects.toThrow(/invalid multiple_choice payload/i);
  });
});
