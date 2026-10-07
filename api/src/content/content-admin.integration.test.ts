/** Admin content CMS (KUR-100) against real Postgres: workflow + optimistic lock. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ContentAdminService, type ExerciseInput } from './admin-service.js';
import { ContentRepository } from './repository.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('content admin CMS (integration)', () => {
  let pool: pg.Pool;
  let content: ContentAdminService;
  const suffix = Date.now().toString(36);
  let skillId = '';
  let courseId = '';

  const mc = (prompt: string) => ({
    position: 1,
    type: 'multiple_choice' as const,
    payload: { prompt, options: ['Silav', 'Na'], correctIndex: 0 },
  });

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    content = new ContentAdminService(pool);
    const repo = new ContentRepository(pool);
    courseId = await repo.createCourse({ slug: `cms-${suffix}`, titleKu: 'K', titleEn: 'CMS Test' });
    const unitId = await repo.createUnit(courseId, 1, 'U', 'Unit');
    skillId = await repo.createSkill(unitId, 1, 'S', 'Skill');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [[`ez baş im ${suffix}`, `sêv ${suffix}`]]);
    // published lessons are immutable and cannot be deleted; archive them first
    // (the one allowed transition) so the course cascade delete is permitted.
    await pool.query(
      `UPDATE lessons SET status = 'archived'
         WHERE status = 'published'
           AND skill_id IN (
             SELECT s.id FROM skills s
             JOIN units u ON u.id = s.unit_id
             WHERE u.course_id = $1
           )`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]); // cascades units→skills→lessons→exercises
    await pool.end();
  });

  it('runs a draft through edit, review, and publish', async () => {
    const { lessonId } = await content.createDraft(skillId, 1, 'Ders', 'Lesson');

    const loaded = (await content.getLesson(lessonId))!;
    expect(loaded.status).toBe('draft');
    expect(loaded.lockVersion).toBe(0);

    // edit with the current lock → bumps to 1
    const upd = await content.updateDraft(lessonId, { titleKu: 'Ders 1', titleEn: 'Lesson 1', exercises: [mc('Hello?')] }, 0);
    expect(upd).toEqual({ ok: true, lockVersion: 1 });
    expect((await content.getLesson(lessonId))!.exercises).toHaveLength(1);

    // draft → in_review → published
    expect(await content.submit(lessonId)).toEqual({ ok: true });
    expect((await content.getLesson(lessonId))!.status).toBe('in_review');
    expect(await content.approve(lessonId)).toEqual({ ok: true });
    expect((await content.getLesson(lessonId))!.status).toBe('published');
  });

  it('rejects a stale write with a conflict (optimistic lock)', async () => {
    const { lessonId } = await content.createDraft(skillId, 2, 'Ders', 'Lesson');
    // both editors loaded lockVersion 0
    const first = await content.updateDraft(lessonId, { titleKu: 'A', titleEn: 'A', exercises: [mc('q')] }, 0);
    expect(first.ok).toBe(true);
    const stale = await content.updateDraft(lessonId, { titleKu: 'B', titleEn: 'B', exercises: [mc('q')] }, 0);
    expect(stale).toEqual({ ok: false, code: 'CONFLICT' });
  });

  it('validates exercises with the import-pipeline rules', async () => {
    const { lessonId } = await content.createDraft(skillId, 3, 'Ders', 'Lesson');
    const res = await content.updateDraft(
      lessonId,
      { titleKu: 'A', titleEn: 'A', exercises: [{ position: 1, type: 'multiple_choice', payload: { prompt: 'x', options: [] } }] },
      0,
    );
    expect(res.ok).toBe(false);
    if (!res.ok && res.code === 'INVALID') expect(res.issues.length).toBeGreaterThan(0);
    else throw new Error('expected INVALID');
  });

  it('forbids editing a non-draft and re-versions a published lesson', async () => {
    const { lessonId } = await content.createDraft(skillId, 4, 'Ders', 'Lesson');
    await content.updateDraft(lessonId, { titleKu: 'A', titleEn: 'A', exercises: [mc('q')] }, 0);
    await content.submit(lessonId);
    // in_review is not editable
    expect(await content.updateDraft(lessonId, { titleKu: 'B', titleEn: 'B', exercises: [mc('q')] }, 1)).toEqual({
      ok: false,
      code: 'NOT_EDITABLE',
    });
    await content.approve(lessonId);
    // editing published clones a new draft version
    const rev = await content.editPublished(lessonId);
    expect(rev.ok).toBe(true);
    if (rev.ok) {
      const draft = (await content.getLesson(rev.lessonId))!;
      expect(draft.status).toBe('draft');
      expect(draft.version).toBeGreaterThan(1);
    }
  });

  /**
   * A listening item with no clip of its own plays the audio studio's
   * recording of its transcription; with neither it would reach learners
   * with nothing to play.
   */
  describe('a listening item with nothing to play', () => {
    const silentText = `Ez baş im ${suffix}.`;
    const listening = (payload: Record<string, unknown>) => ({ position: 2, type: 'listening' as const, payload });

    async function inReview(position: number, exercises: ExerciseInput[]): Promise<string> {
      const { lessonId } = await content.createDraft(skillId, position, 'Bihîstin', 'Listening');
      expect((await content.updateDraft(lessonId, { titleKu: 'B', titleEn: 'Listening', exercises }, 0)).ok).toBe(true);
      expect(await content.submit(lessonId)).toEqual({ ok: true });
      return lessonId;
    }

    it('keeps the lesson from being approved until its transcription is recorded', async () => {
      const lessonId = await inReview(5, [mc('q'), listening({ prompt: 'Type what you hear', accepted: [silentText, 'ez bash im'] })]);

      expect(await content.approve(lessonId)).toEqual({
        ok: false,
        code: 'LISTENING_AUDIO_MISSING',
        silent: [{ index: 1, text: silentText }],
      });
      // still waiting for review, not half-published
      expect((await content.getLesson(lessonId))!.status).toBe('in_review');

      // recorded — however it was punctuated when it was — and it can go out
      await pool.query(
        `INSERT INTO lesson_audio (key, text, media_key, url, content_type, duration_ms)
         VALUES ($1, $2, 'test', 'https://cdn.test/lesson-audio/x.wav', 'audio/wav', 1200)`,
        [`ez baş im ${suffix}`, `ez baş im ${suffix}`],
      );
      expect(await content.approve(lessonId)).toEqual({ ok: true });
      expect((await content.getLesson(lessonId))!.status).toBe('published');
    });

    it('approves a listening item that brings its own clip', async () => {
      const lessonId = await inReview(6, [listening({ audioUrl: 'https://cdn.test/own.mp3', accepted: [`Sêv ${suffix}`] })]);
      expect(await content.approve(lessonId)).toEqual({ ok: true });
    });

    it('still answers for a missing lesson and a lesson in the wrong state', async () => {
      expect(await content.approve('00000000-0000-0000-0000-000000000000')).toEqual({ ok: false, code: 'NOT_FOUND' });
      const { lessonId } = await content.createDraft(skillId, 7, 'Ders', 'Lesson');
      expect(await content.approve(lessonId)).toEqual({ ok: false, code: 'BAD_STATE' });
    });
  });
});
