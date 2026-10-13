/**
 * Writing stories in the admin panel, against real Postgres: who may, drafts
 * that may be unfinished, the lock that stops two editors overwriting each
 * other, review and publishing with the whole check, the audit of each
 * status change, and a played story that cannot be deleted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { testBank, testStory, type TestStory } from '../test/stories.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('story admin (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  const userIds: string[] = [];
  const net = Math.floor(Math.random() * 250);
  let editor = '';
  let editorId = '';
  let legacyAdmin = '';
  let learner = '';
  const probe = `story_use_probe_${s}`;

  async function register(name: string, roles: string): Promise<{ token: string; id: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${s}@it.kurda.app`,
        username: `${name}_${s}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      // its own address per account and per run: signups are capped per address over a day
      remoteAddress: `10.96.${net}.${userIds.length + 1}`,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token, '10.96.0.2');
    return { token, id };
  }

  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, token = editor) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      remoteAddress: '10.96.0.3',
    });

  const slug = (name: string) => `adm-${name}-${s}`;

  /** a whole story, created through the route */
  async function created(name: string, over: Partial<TestStory> = {}): Promise<{ id: string; lockVersion: number }> {
    const res = await call('POST', '/admin/stories', testStory(slug(name), over));
    expect(res.statusCode, res.body).toBe(201);
    return res.json();
  }

  const put = (id: string, story: TestStory, lockVersion: number) => call('PUT', `/admin/stories/${id}`, { ...story, lockVersion });
  /** a status change as the admin panel makes it: with the version it loaded (the latest, unless given) */
  const act = async (id: string, action: string, lockVersion?: number) =>
    call('POST', `/admin/stories/${id}/${action}`, {
      lockVersion: lockVersion ?? (await call('GET', `/admin/stories/${id}`)).json().lockVersion,
    });
  const publicList = async () => (await app.inject({ method: 'GET', url: '/stories' })).json().stories as Array<{ id: string }>;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    ({ token: editor, id: editorId } = await register('stEditor', '{content_editor}'));
    ({ token: legacyAdmin } = await register('stAdmin', '{admin}'));
    ({ token: learner } = await register('stLearner', '{}'));
  });

  afterAll(async () => {
    await pool.query(`DROP TABLE IF EXISTS ${probe}`);
    await pool.query(`DELETE FROM stories WHERE slug LIKE $1`, [`%-${s}`]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('is for the people who edit lessons, and nobody else', async () => {
    expect((await call('GET', '/admin/stories', undefined, '')).statusCode).toBe(401);
    expect((await call('GET', '/admin/stories', undefined, learner)).statusCode).toBe(403);
    expect((await call('POST', '/admin/stories', testStory(slug('nope')), learner)).statusCode).toBe(403);
    expect((await call('GET', '/admin/stories', undefined, legacyAdmin)).statusCode).toBe(200);
    expect((await call('GET', '/admin/stories')).statusCode).toBe(200);
  });

  describe('drafts', () => {
    it('starts one from a title alone, and says what it still needs', async () => {
      const res = await call('POST', '/admin/stories', { dialect: 'kurmanci', level: 2, title: `Nameya Dapîrê ${s}` });
      expect(res.statusCode, res.body).toBe(201);
      const story = res.json();
      expect(story).toMatchObject({
        slug: `nameya-dapire-${s}`,
        status: 'draft',
        source: 'admin',
        body: '',
        wordCount: 0,
        length: null,
        questions: [],
        lockVersion: 0,
        publishedAt: null,
      });
      expect(story.problems.errors.map((e: { code: string }) => e.code)).toEqual(['BODY_EMPTY']);
      const row = await pool.query(`SELECT created_by, updated_by FROM stories WHERE id = $1`, [story.id]);
      expect(row.rows[0]).toEqual({ created_by: editorId, updated_by: editorId });

      // the same title again gets the next free address
      const again = await call('POST', '/admin/stories', { dialect: 'kurmanci', level: 2, title: `Nameya Dapîrê ${s}` });
      expect(again.json().slug).toBe(`nameya-dapire-${s}-2`);
      // a Soranî title cannot spell one: a placeholder for the editor to change
      const sorani = await call('POST', '/admin/stories', { dialect: 'sorani', level: 1, title: 'کلیلی ماڵەوە' });
      expect(sorani.json().slug).toMatch(/^sorani-[a-z2-9]{6}$/);
      await pool.query(`UPDATE stories SET slug = $2 WHERE id = $1`, [sorani.json().id, slug('sorani-title')]);
    });

    it('refuses an address that is taken, and a broken story, with where it is broken', async () => {
      const first = await created('taken');
      expect(first.id).toEqual(expect.any(String));
      const taken = await call('POST', '/admin/stories', testStory(slug('taken')));
      expect(taken.statusCode).toBe(409);
      expect(taken.json().code).toBe('SLUG_TAKEN');

      const broken = testStory(slug('broken'));
      broken.questions[1]!.options = ['Erê', ' '];
      const res = await call('POST', '/admin/stories', broken);
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('INVALID');
      expect(res.json().details.errors).toEqual([
        { code: 'OPTION_EMPTY', path: 'questions[1].options[1]', message: 'an option is empty' },
      ]);
      expect((await pool.query(`SELECT 1 FROM stories WHERE slug = $1`, [slug('broken')])).rowCount).toBe(0);

      // a bad slug or a missing field is the request's fault, not the story's
      expect((await call('POST', '/admin/stories', { ...testStory('Not A Slug') })).statusCode).toBe(400);
      expect((await call('POST', '/admin/stories', { title: 'x', level: 1 })).statusCode).toBe(400);
    });

    it('saves an unfinished draft, and computes what its text says about itself', async () => {
      const { id, lockVersion } = await created('unfinished', { questions: testBank(2) });
      const got = (await call('GET', `/admin/stories/${id}`)).json();
      expect(got).toMatchObject({ status: 'draft', length: 'short', wordCount: 82, readingMinutes: 2, lockVersion });
      expect(got.questions).toHaveLength(2);
      expect(got.questions[0]).toEqual({ id: expect.any(String), ...testBank(2)[0] });
      // too few questions: not an error until it is submitted
      expect(got.problems.errors.map((e: { code: string }) => e.code)).toEqual(['BANK_TOO_SMALL']);

      const keys = await pool.query(`SELECT sentence_keys FROM stories WHERE id = $1`, [id]);
      expect(keys.rows[0].sentence_keys).toHaveLength(10);
      expect(keys.rows[0].sentence_keys[0]).toBe('rojîn deh salî ye');
    });

    it('replaces a draft only for an editor who has the latest version', async () => {
      const { id, lockVersion } = await created('locked');
      const edited = testStory(slug('locked'), { title: 'Sernavê nû', questions: testBank(7, ' (nû)') });
      const res = await put(id, edited, lockVersion);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toMatchObject({ title: 'Sernavê nû', lockVersion: lockVersion + 1 });
      expect(res.json().questions.map((q: { prompt: string }) => q.prompt)).toEqual(testBank(7, ' (nû)').map((q) => q.prompt));
      expect((await pool.query(`SELECT count(*)::int n FROM story_questions WHERE story_id = $1`, [id])).rows[0].n).toBe(7);

      // a second editor still holding the first version
      const stale = await put(id, testStory(slug('locked'), { title: 'Sernavê kevn' }), lockVersion);
      expect(stale.statusCode).toBe(409);
      expect(stale.json().code).toBe('STALE');
      expect((await call('GET', `/admin/stories/${id}`)).json().title).toBe('Sernavê nû');

      // the slug may change, but not to one in use
      const clash = await put(id, testStory(slug('taken')), lockVersion + 1);
      expect(clash.statusCode).toBe(409);
      expect(clash.json().code).toBe('SLUG_TAKEN');
      const missingLock = await call('PUT', `/admin/stories/${id}`, edited);
      expect(missingLock.statusCode).toBe(400);
      // the whole draft or nothing: leaving the questions out does not delete them
      const withoutQuestions: Partial<TestStory> = { ...edited };
      delete withoutQuestions.questions;
      expect((await put(id, withoutQuestions as TestStory, lockVersion + 1)).statusCode).toBe(400);
      expect((await call('GET', `/admin/stories/${id}`)).json().questions).toHaveLength(7);
    });

    it('answers 404 for a story that is not there', async () => {
      const none = '00000000-0000-4000-8000-000000000000';
      expect((await call('GET', `/admin/stories/${none}`)).statusCode).toBe(404);
      expect((await put(none, testStory(slug('none')), 0)).statusCode).toBe(404);
      expect((await act(none, 'publish', 0)).statusCode).toBe(404);
      expect((await call('DELETE', `/admin/stories/${none}?lockVersion=0`)).statusCode).toBe(404);
      expect((await call('GET', '/admin/stories/not-a-uuid')).statusCode).toBe(400);
    });
  });

  describe('review and publishing', () => {
    it('submits and publishes only a whole story, and puts it in the app at once', async () => {
      const { id } = await created('review', { questions: testBank(3) });
      // the public list is asked (and cached) before anything is published
      expect((await publicList()).some((st) => st.id === id)).toBe(false);

      const notYet = await act(id, 'submit');
      expect(notYet.statusCode).toBe(422);
      expect(notYet.json().details.errors.map((e: { code: string }) => e.code)).toEqual(['BANK_TOO_SMALL']);

      const draft = (await call('GET', `/admin/stories/${id}`)).json();
      const fixed = await put(id, testStory(slug('review')), draft.lockVersion);
      const submitted = await act(id, 'submit', fixed.json().lockVersion);
      expect(submitted.statusCode, submitted.body).toBe(200);
      expect(submitted.json().status).toBe('in_review');

      // still editable in review
      const inReview = await put(id, testStory(slug('review'), { level: 2 }), submitted.json().lockVersion);
      expect(inReview.statusCode).toBe(200);
      expect(inReview.json()).toMatchObject({ status: 'in_review', level: 2 });

      // a stale publish is refused: the reviewer has not seen the latest edit
      const stale = await act(id, 'publish', submitted.json().lockVersion);
      expect(stale.json().code).toBe('STALE');

      const published = await act(id, 'publish', inReview.json().lockVersion);
      expect(published.statusCode, published.body).toBe(200);
      expect(published.json()).toMatchObject({ status: 'published', publishedAt: expect.any(String) });
      const row = await pool.query(`SELECT published_by FROM stories WHERE id = $1`, [id]);
      expect(row.rows[0].published_by).toBe(editorId);
      expect((await publicList()).some((st) => st.id === id)).toBe(true);

      const audit = await pool.query(`SELECT action, before, after FROM admin_audit_log WHERE target_id = $1 AND action LIKE 'story.%'`, [id]);
      expect(audit.rows).toEqual([
        {
          action: 'story.publish',
          before: { status: 'in_review', slug: slug('review'), title: `Çîrok ${slug('review')}`, lockVersion: inReview.json().lockVersion },
          after: { status: 'published', slug: slug('review'), title: `Çîrok ${slug('review')}`, lockVersion: inReview.json().lockVersion + 1 },
        },
      ]);

      // published is read-only: unpublish to edit
      const edit = await put(id, testStory(slug('review')), published.json().lockVersion);
      expect(edit.statusCode).toBe(409);
      expect(edit.json().code).toBe('NOT_EDITABLE');
    });

    it('takes a story out of the app at once when it is unpublished or archived', async () => {
      const { id, lockVersion } = await created('pulled');
      const published = await act(id, 'publish', lockVersion);
      expect(published.statusCode, published.body).toBe(200);
      expect((await publicList()).some((st) => st.id === id)).toBe(true);
      expect((await app.inject({ method: 'GET', url: `/stories/${slug('pulled')}` })).statusCode).toBe(200);

      const unpublished = await act(id, 'unpublish');
      expect(unpublished.json().status).toBe('draft');
      expect((await publicList()).some((st) => st.id === id)).toBe(false);
      expect((await app.inject({ method: 'GET', url: `/stories/${slug('pulled')}` })).statusCode).toBe(404);

      await act(id, 'publish');
      expect((await publicList()).some((st) => st.id === id)).toBe(true);
      const archived = await act(id, 'archive');
      expect(archived.json().status).toBe('archived');
      expect((await publicList()).some((st) => st.id === id)).toBe(false);

      const actions = await pool.query(
        `SELECT action, before->>'status' AS "from", after->>'status' AS "to" FROM admin_audit_log
         WHERE target_id = $1 AND action LIKE 'story.%' ORDER BY created_at, id`,
        [id],
      );
      expect(actions.rows).toEqual([
        { action: 'story.publish', from: 'draft', to: 'published' },
        { action: 'story.unpublish', from: 'published', to: 'draft' },
        { action: 'story.publish', from: 'draft', to: 'published' },
        { action: 'story.archive', from: 'published', to: 'archived' },
      ]);

      // nothing leaves the archive but a delete
      for (const action of ['publish', 'submit', 'unpublish', 'archive']) {
        const res = await act(id, action);
        expect(res.statusCode).toBe(409);
        expect(res.json().code).toBe('BAD_STATE');
      }
      expect((await put(id, testStory(slug('pulled')), archived.json().lockVersion)).json().code).toBe('NOT_EDITABLE');
    });

    it('changes nothing for a request that does not say which version it was made on', async () => {
      const { id, lockVersion } = await created('unversioned');
      const bare = await app.inject({
        method: 'POST',
        url: `/admin/stories/${id}/publish`,
        headers: { authorization: `Bearer ${editor}` },
        remoteAddress: '10.96.0.3',
      });
      expect(bare.statusCode).toBe(400);
      for (const action of ['submit', 'publish', 'unpublish', 'archive']) {
        expect((await call('POST', `/admin/stories/${id}/${action}`, {})).statusCode).toBe(400);
      }
      expect((await call('DELETE', `/admin/stories/${id}`)).statusCode).toBe(400);
      expect((await call('GET', `/admin/stories/${id}`)).json()).toMatchObject({ status: 'draft', lockVersion });
      expect((await act(id, 'publish', lockVersion)).json().status).toBe('published');
    });

    it('lists stories with what stands between each and publishing', async () => {
      const res = await call('GET', '/admin/stories?status=draft&dialect=kurmanci');
      expect(res.statusCode).toBe(200);
      const ours = (res.json().stories as Array<Record<string, unknown>>).filter((st) => String(st.slug).endsWith(s));
      expect(ours.every((st) => st.status === 'draft' && st.dialect === 'kurmanci')).toBe(true);
      const unfinished = ours.find((st) => st.slug === slug('unfinished'))!;
      expect(unfinished).toMatchObject({
        questionCount: 2,
        wordCount: 82,
        length: 'short',
        source: 'admin',
        problems: { errors: 1, warnings: 0 },
      });
      expect(unfinished).not.toHaveProperty('body');
      expect((await call('GET', '/admin/stories?status=nope')).statusCode).toBe(400);
    });
  });

  describe('deleting', () => {
    it('deletes a story nobody played, keeping the whole of it in the audit', async () => {
      const { id, lockVersion } = await created('gone');
      expect((await call('DELETE', `/admin/stories/${id}?lockVersion=${lockVersion + 5}`)).json().code).toBe('STALE');
      const res = await call('DELETE', `/admin/stories/${id}?lockVersion=${lockVersion}`);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toEqual({ id, deleted: true });
      expect((await call('GET', `/admin/stories/${id}`)).statusCode).toBe(404);
      expect((await pool.query(`SELECT 1 FROM story_questions WHERE story_id = $1`, [id])).rowCount).toBe(0);
      const audit = await pool.query(`SELECT before, after FROM admin_audit_log WHERE target_id = $1 AND action = 'story.delete'`, [id]);
      expect(audit.rows[0].after).toBeNull();
      expect(audit.rows[0].before).toMatchObject({ slug: slug('gone'), status: 'draft', body: testStory('x').body });
      expect(audit.rows[0].before.questions).toHaveLength(6);
    });

    it('refuses to delete a story a game was played on: archive it instead', async () => {
      // a stand-in for the games table, which refers to its story the same way
      await pool.query(`CREATE TABLE ${probe} (story_id uuid NOT NULL REFERENCES stories ON DELETE RESTRICT)`);
      const { id } = await created('played');
      await pool.query(`INSERT INTO ${probe} (story_id) VALUES ($1)`, [id]);
      const res = await call('DELETE', `/admin/stories/${id}?lockVersion=0`);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('IN_USE');
      expect((await call('GET', `/admin/stories/${id}`)).statusCode).toBe(200);
      expect((await pool.query(`SELECT 1 FROM admin_audit_log WHERE target_id = $1 AND action = 'story.delete'`, [id])).rowCount).toBe(0);
      expect((await act(id, 'archive')).json().status).toBe('archived');
    });
  });
});
