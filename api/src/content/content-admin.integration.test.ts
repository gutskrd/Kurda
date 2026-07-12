/** Admin content CMS (KUR-100) against real Postgres: workflow + optimistic lock. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ContentAdminService } from './admin-service.js';
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
});
