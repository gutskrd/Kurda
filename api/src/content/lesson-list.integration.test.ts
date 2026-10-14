/**
 * The admin's lesson list (GET /admin/content/lessons) over HTTP: an editor
 * finds a lesson by its title instead of pasting its id, sees one row per
 * lesson slot (the newest version, with the live one beside it), and gets the
 * skills a new lesson can go in.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { ContentAdminService } from './admin-service.js';
import { ContentRepository } from './repository.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface ListBody {
  total: number;
  lessons: Array<{
    id: string;
    skillId: string;
    position: number;
    version: number;
    status: string;
    titleEn: string;
    exerciseCount: number;
    liveId: string | null;
    course: { id: string; title: string };
    unit: { title: string };
    skill: { id: string; title: string };
  }>;
  skills: Array<{ id: string; titleEn: string; unitTitle: string; courseTitle: string; nextPosition: number }>;
}

describe.skipIf(!DATABASE_URL)('admin lesson list (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let content: ContentAdminService;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];
  let editorTok = '';
  let supportTok = '';
  let courseId = '';
  let skillId = '';
  let emptySkillId = '';
  let draftId = '';
  let publishedId = '';
  let nextDraftId = '';

  async function account(tag: string, roles: string, ip: string): Promise<string> {
    const r = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `ll_${tag}_${suffix}@it.kurda.app`,
        username: `ll_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, r);
    userIds.push(r.json().user.id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [r.json().user.id, roles]);
    return r.json().tokens.accessToken as string;
  }

  const list = (query: string, token = editorTok) =>
    app.inject({
      method: 'GET',
      url: `/admin/content/lessons${query}`,
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.81.0.9',
    });

  const mc = { position: 1, type: 'multiple_choice' as const, payload: { prompt: 'Silav?', options: ['Silav', 'Na'], correctIndex: 0 } };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    content = new ContentAdminService(pool);
    const repo = new ContentRepository(pool);
    courseId = await repo.createCourse({ slug: `ll-${suffix}`, titleKu: 'K', titleEn: `List course ${suffix}` });
    const unitId = await repo.createUnit(courseId, 1, 'Yekîne', `Greetings unit ${suffix}`);
    skillId = await repo.createSkill(unitId, 1, 'Silav', `Hello skill ${suffix}`);
    emptySkillId = await repo.createSkill(unitId, 2, 'Vala', `Empty skill ${suffix}`);

    // slot 1: a draft nobody has published
    draftId = (await content.createDraft(skillId, 1, 'Silav', `Saying hello ${suffix}`)).lessonId;
    // slot 2: published, then a second version opened as a draft
    publishedId = (await content.createDraft(skillId, 2, 'Malbat', `Family ${suffix}`)).lessonId;
    await content.updateDraft(publishedId, { titleKu: 'Malbat', titleEn: `Family ${suffix}`, exercises: [mc] }, 0);
    await content.submit(publishedId);
    expect(await content.approve(publishedId)).toEqual({ ok: true });
    const next = await content.editPublished(publishedId);
    if (!next.ok) throw new Error('could not open a new version');
    nextDraftId = next.lessonId;

    editorTok = await account('ed', '{content_editor}', '10.81.0.1');
    supportTok = await account('sp', '{support}', '10.81.0.2');
    await pass2fa(app, editorTok);
    await pass2fa(app, supportTok);
  });

  afterAll(async () => {
    // a published lesson is immutable until archived, the one move allowed
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE status = 'published'
          AND skill_id IN (SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('lists each lesson slot once, as its newest version, with the live version beside a newer draft', async () => {
    const res = await list(`?q=${encodeURIComponent(suffix)}`);
    expect(res.statusCode).toBe(200);
    const body = res.json() as ListBody;
    const mine = body.lessons.filter((l) => l.course.id === courseId);
    expect(mine.map((l) => l.position)).toEqual([1, 2]);

    const [first, second] = mine;
    expect(first).toMatchObject({ id: draftId, status: 'draft', version: 1, liveId: null, exerciseCount: 0 });
    expect(first!.skill).toMatchObject({ id: skillId, title: `Hello skill ${suffix}` });
    expect(first!.unit.title).toBe(`Greetings unit ${suffix}`);
    // the slot's newest version is the draft of version 2; learners are on version 1
    expect(second).toMatchObject({ id: nextDraftId, status: 'draft', version: 2, liveId: publishedId, exerciseCount: 1 });
  });

  it('filters by the newest version’s status, and finds a lesson by title or by any of its ids', async () => {
    const drafts = (await list(`?status=draft&q=${encodeURIComponent(suffix)}`)).json() as ListBody;
    expect(drafts.lessons.map((l) => l.id).sort()).toEqual([draftId, nextDraftId].sort());

    // the live version is not the newest of its slot, so "published" has nothing of ours
    const live = (await list(`?status=published&q=${encodeURIComponent(suffix)}`)).json() as ListBody;
    expect(live.lessons.filter((l) => l.course.id === courseId)).toEqual([]);

    const byTitle = (await list(`?q=${encodeURIComponent(`family ${suffix}`)}`)).json() as ListBody;
    expect(byTitle.lessons.map((l) => l.id)).toEqual([nextDraftId]);
    expect(byTitle.total).toBe(1);

    // pasting the old (published) id still finds its slot
    const byId = (await list(`?q=${publishedId}`)).json() as ListBody;
    expect(byId.lessons.map((l) => l.id)).toEqual([nextDraftId]);

    // a skill's or a unit's title finds its lessons too
    const bySkill = (await list(`?q=${encodeURIComponent(`hello skill ${suffix}`)}`)).json() as ListBody;
    expect(bySkill.lessons).toHaveLength(2);

    // LIKE wildcards are matched literally, not as wildcards
    const wild = (await list(`?q=${encodeURIComponent('%_%')}`)).json() as ListBody;
    expect(wild.lessons.filter((l) => l.course.id === courseId)).toEqual([]);
  });

  it('leaves archived slots out unless asked for everything', async () => {
    await pool.query(`UPDATE lessons SET status = 'archived' WHERE id = $1`, [draftId]);
    const shown = (await list(`?q=${encodeURIComponent(suffix)}`)).json() as ListBody;
    expect(shown.lessons.map((l) => l.id)).not.toContain(draftId);
    const all = (await list(`?status=all&q=${encodeURIComponent(suffix)}`)).json() as ListBody;
    expect(all.lessons.map((l) => l.id)).toContain(draftId);
    await pool.query(`UPDATE lessons SET status = 'draft' WHERE id = $1`, [draftId]);
  });

  it('offers the skills a new lesson can go in, with the next free position', async () => {
    const body = (await list(`?q=${encodeURIComponent(suffix)}`)).json() as ListBody;
    const hello = body.skills.find((s) => s.id === skillId);
    const empty = body.skills.find((s) => s.id === emptySkillId);
    expect(hello).toMatchObject({ titleEn: `Hello skill ${suffix}`, unitTitle: `Greetings unit ${suffix}`, nextPosition: 3 });
    expect(empty).toMatchObject({ nextPosition: 1, courseTitle: `List course ${suffix}` });
  });

  it('says where an opened lesson sits in the course', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/content/lessons/${draftId}`,
      headers: { authorization: `Bearer ${editorTok}` },
      remoteAddress: '10.81.0.9',
    });
    expect(res.json()).toMatchObject({
      skillTitle: `Hello skill ${suffix}`,
      unitTitle: `Greetings unit ${suffix}`,
      courseTitle: `List course ${suffix}`,
    });
  });

  it('is for content editors and superadmins only, and refuses a bad status', async () => {
    expect((await list('', supportTok)).statusCode).toBe(403);
    expect((await list('?status=everything')).statusCode).toBe(400);
  });
});
