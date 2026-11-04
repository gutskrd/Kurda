/**
 * Writing stories in the admin panel, against real Postgres: who may, drafts
 * that may be unfinished, the lock that stops two editors overwriting each
 * other, review and publishing with the whole check, the audit of each
 * status change, and a played story that cannot be deleted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { lessonAudioKey } from '@kurda/shared';
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
  /** a reviewer's verdict, with the version they have just loaded */
  const review = async (id: string, approved: boolean, note?: string) =>
    call('POST', `/admin/stories/${id}/review`, {
      approved,
      note,
      lockVersion: (await call('GET', `/admin/stories/${id}`)).json().lockVersion,
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
    await pool.query(`DELETE FROM story_categories WHERE slug LIKE $1`, [`cat-%-${s}`]);
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
    expect((await call('GET', '/admin/stories', undefined, learner)).statusCode).toBe(404);
    expect((await call('POST', '/admin/stories', testStory(slug('nope')), learner)).statusCode).toBe(404);
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
        origin: 'admin',
        body: '',
        wordCount: 0,
        length: null,
        questions: [],
        lockVersion: 0,
        publishedAt: null,
        language: 'ku',
        cefr: 'A2',
        category: null,
        tradition: 'original',
        translations: {},
        reviewStatus: 'unreviewed',
        featured: false,
        glossaryMatches: [],
        audio: { sentences: [], recorded: 0, total: 0 },
      });
      // no text and no category yet: both wait until it is published
      expect(story.problems.errors.map((e: { code: string }) => e.code)).toEqual(['CATEGORY_MISSING', 'BODY_EMPTY']);
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

      // and so is one nobody has approved: the whole-story check says it is complete, not that anyone read it
      const unreviewed = await act(id, 'publish', inReview.json().lockVersion);
      expect(unreviewed.statusCode).toBe(409);
      expect(unreviewed.json().code).toBe('NOT_REVIEWED');
      const reviewed = await call('POST', `/admin/stories/${id}/review`, { approved: true, note: 'Read twice.', lockVersion: inReview.json().lockVersion });
      expect(reviewed.statusCode, reviewed.body).toBe(200);
      expect(reviewed.json()).toMatchObject({
        status: 'in_review',
        reviewStatus: 'approved',
        reviewNote: 'Read twice.',
        reviewedBy: { id: editorId, username: `stEditor_${s}`.slice(0, 30) },
        reviewedAt: expect.any(String),
        lockVersion: inReview.json().lockVersion + 1,
      });

      const published = await act(id, 'publish', reviewed.json().lockVersion);
      expect(published.statusCode, published.body).toBe(200);
      expect(published.json()).toMatchObject({ status: 'published', publishedAt: expect.any(String), reviewStatus: 'approved' });
      const row = await pool.query(`SELECT published_by FROM stories WHERE id = $1`, [id]);
      expect(row.rows[0].published_by).toBe(editorId);
      expect((await publicList()).some((st) => st.id === id)).toBe(true);

      // the audit keeps what the reviewer approved, word for word: the row itself may later be unpublished and rewritten
      const audit = await pool.query(
        `SELECT action, before, after FROM admin_audit_log WHERE target_id = $1 AND action LIKE 'story.%' ORDER BY created_at, id`,
        [id],
      );
      const approved = testStory(slug('review'), { level: 2 });
      expect(audit.rows.map((r) => r.action)).toEqual(['story.review', 'story.publish']);
      expect(audit.rows[0]).toMatchObject({
        before: { slug: slug('review'), reviewStatus: 'unreviewed', reviewNote: null },
        after: { slug: slug('review'), reviewStatus: 'approved', reviewNote: 'Read twice.' },
      });
      expect(audit.rows[1].before).toEqual({
        status: 'in_review',
        slug: slug('review'),
        title: `Çîrok ${slug('review')}`,
        lockVersion: reviewed.json().lockVersion,
      });
      expect(audit.rows[1].after).toMatchObject({
        status: 'published',
        slug: slug('review'),
        title: approved.title,
        lockVersion: reviewed.json().lockVersion + 1,
        dialect: 'kurmanci',
        language: 'ku',
        level: 2,
        summary: approved.summary,
        body: approved.body,
        category: 'folktale',
        tradition: 'original',
        translations: {},
        questions: approved.questions.map((q, i) => ({ ...q, id: published.json().questions[i].id })),
      });
      expect(audit.rows[1].after.glossary.map((g: { term: string }) => g.term)).toEqual(['cotkar']);

      // published is read-only: unpublish to edit
      const edit = await put(id, testStory(slug('review')), published.json().lockVersion);
      expect(edit.statusCode).toBe(409);
      expect(edit.json().code).toBe('NOT_EDITABLE');
    });

    it('takes a story out of the app at once when it is unpublished or archived', async () => {
      const { id } = await created('pulled');
      expect((await review(id, true)).statusCode).toBe(200);
      const published = await act(id, 'publish');
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

      // unpublishing keeps the approval: the text was not touched, so publishing again needs no second reading
      const actions = await pool.query(
        `SELECT action, before->>'status' AS "from", after->>'status' AS "to" FROM admin_audit_log
         WHERE target_id = $1 AND action LIKE 'story.%' ORDER BY created_at, id`,
        [id],
      );
      expect(actions.rows).toEqual([
        { action: 'story.review', from: null, to: null },
        { action: 'story.publish', from: 'draft', to: 'published' },
        { action: 'story.unpublish', from: 'published', to: 'draft' },
        { action: 'story.publish', from: 'draft', to: 'published' },
        { action: 'story.archive', from: 'published', to: 'archived' },
      ]);
      // what learners were reading when it was pulled is kept with each pull
      const pulls = await pool.query(
        `SELECT before, after FROM admin_audit_log WHERE target_id = $1 AND action IN ('story.unpublish', 'story.archive')`,
        [id],
      );
      for (const { before, after } of pulls.rows) {
        expect(before).toMatchObject({
          status: 'published',
          body: testStory('x').body,
          glossary: [{ term: 'cotkar', meanings: { en: 'farmer' } }],
        });
        expect(before.questions).toHaveLength(6);
        expect(after).not.toHaveProperty('body');
      }

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
      for (const action of ['review', 'feature']) expect((await call('POST', `/admin/stories/${id}/${action}`, {})).statusCode).toBe(400);
      await review(id, true);
      expect((await act(id, 'publish')).json().status).toBe('published');
    });

    it('lists stories with what stands between each and publishing, a page at a time', async () => {
      const res = await call('GET', '/admin/stories?status=draft&dialect=kurmanci');
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBeGreaterThanOrEqual(res.json().stories.length);
      const ours = (res.json().stories as Array<Record<string, unknown>>).filter((st) => String(st.slug).endsWith(s));
      expect(ours.every((st) => st.status === 'draft' && st.dialect === 'kurmanci')).toBe(true);
      const unfinished = ours.find((st) => st.slug === slug('unfinished'))!;
      expect(unfinished).toMatchObject({
        questionCount: 2,
        wordCount: 82,
        length: 'short',
        origin: 'admin',
        language: 'ku',
        cefr: 'A1',
        category: 'folktale',
        tradition: 'original',
        reviewStatus: 'unreviewed',
        featured: false,
        audio: 'none',
        translationGroup: null,
        problems: { errors: 1, warnings: 0 },
      });
      expect(unfinished).not.toHaveProperty('body');
      expect((await call('GET', '/admin/stories?status=nope')).statusCode).toBe(400);
      expect((await call('GET', '/admin/stories?level=6')).statusCode).toBe(400);

      // by search, review state, category and featured; and in pages
      const byTitle = await call('GET', `/admin/stories?q=${encodeURIComponent(slug('unfinished'))}`);
      expect(byTitle.json().stories.map((st: { slug: string }) => st.slug)).toEqual([slug('unfinished')]);
      expect(byTitle.json().total).toBe(1);
      const approved = (await call('GET', '/admin/stories?review=approved&status=published')).json();
      expect(approved.stories.every((st: { reviewStatus: string }) => st.reviewStatus === 'approved')).toBe(true);
      expect((await call('GET', '/admin/stories?category=nature')).json().stories.filter((st: { slug: string }) => st.slug.endsWith(s))).toEqual([]);
      expect((await call('GET', '/admin/stories?featured=1')).json().stories.every((st: { featured: boolean }) => st.featured)).toBe(true);
      const all = (await call('GET', '/admin/stories?status=draft&dialect=kurmanci&limit=100')).json();
      const first = (await call('GET', '/admin/stories?status=draft&dialect=kurmanci&limit=1')).json();
      const second = (await call('GET', '/admin/stories?status=draft&dialect=kurmanci&limit=1&offset=1')).json();
      expect(first.total).toBe(all.total);
      expect([first.stories[0].id, second.stories[0].id]).toEqual(all.stories.slice(0, 2).map((st: { id: string }) => st.id));
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

  describe('review, featuring and versions', () => {
    const filing = { category: 'fable', tradition: 'adapted', source: 'Botan', author: 'Gelêrî', cover: 'ders', readingMinutes: 4 } as const;

    it('takes approval away when the content changes, and keeps it when only the filing changes', async () => {
      const { id } = await created('reread');
      const approved = await review(id, true, 'Fine.');
      expect(approved.statusCode, approved.body).toBe(200);
      expect(approved.json()).toMatchObject({ reviewStatus: 'approved', reviewNote: 'Fine.' });

      // how the story is filed and attributed is not what the reviewer read
      const filed = await put(id, testStory(slug('reread'), filing), approved.json().lockVersion);
      expect(filed.statusCode, filed.body).toBe(200);
      expect(filed.json()).toMatchObject({ ...filing, reviewStatus: 'approved', readingMinutesOverride: 4, readingMinutes: 4 });
      expect(filed.json().problems).toEqual({ errors: [], warnings: [] });

      // the text is: the approval goes, and publishing waits for the next reading
      const retold = await put(id, testStory(slug('reread'), { ...filing, title: 'Sernavê nû' }), filed.json().lockVersion);
      expect(retold.json()).toMatchObject({ reviewStatus: 'unreviewed', reviewedBy: null, reviewedAt: null, reviewNote: null, title: 'Sernavê nû' });
      expect((await act(id, 'publish')).json().code).toBe('NOT_REVIEWED');

      // a translation is content too, and one that does not line up with the text is refused
      await review(id, true);
      const misaligned = await put(id, testStory(slug('reread'), { ...filing, translations: { en: 'One.\n\nTwo.' } }), (await call('GET', `/admin/stories/${id}`)).json().lockVersion);
      expect(misaligned.statusCode).toBe(422);
      expect(misaligned.json().details.errors.map((e: { code: string }) => e.code)).toEqual(['TRANSLATION_PARAGRAPHS']);
      const translated = await put(
        id,
        testStory(slug('reread'), { ...filing, translations: { en: 'One.\n\nTwo.\n\nThree.' } }),
        (await call('GET', `/admin/stories/${id}`)).json().lockVersion,
      );
      expect(translated.statusCode, translated.body).toBe(200);
      expect(translated.json()).toMatchObject({ reviewStatus: 'unreviewed', translations: { en: 'One.\n\nTwo.\n\nThree.' } });
      // a traditional story that names no source is worth a look, never a refusal
      const unsourced = await put(id, testStory(slug('reread'), { ...filing, source: null }), translated.json().lockVersion);
      expect(unsourced.json().problems.warnings.map((w: { code: string }) => w.code)).toEqual(['SOURCE_MISSING']);
      expect((await put(id, testStory(slug('reread'), { sourceUrl: 'http://example.org' }), unsourced.json().lockVersion)).statusCode).toBe(422);
    });

    it('refuses to withdraw approval from a live story, and to review an archived one', async () => {
      const { id } = await created('live');
      await review(id, true);
      expect((await act(id, 'publish')).json().status).toBe('published');
      const withdraw = await review(id, false, 'Second thoughts.');
      expect(withdraw.statusCode).toBe(409);
      expect(withdraw.json().code).toBe('BAD_STATE');
      // approving again changes nothing that matters
      expect((await review(id, true)).json().reviewStatus).toBe('approved');
      await act(id, 'unpublish');
      const withdrawn = await review(id, false, 'Second thoughts.');
      expect(withdrawn.json()).toMatchObject({ reviewStatus: 'unreviewed', reviewNote: 'Second thoughts.', reviewedBy: { id: editorId } });
      expect((await act(id, 'publish')).json().code).toBe('NOT_REVIEWED');
      await act(id, 'archive');
      expect((await review(id, true)).json().code).toBe('BAD_STATE');
      const stale = await call('POST', `/admin/stories/${id}/review`, { approved: true, lockVersion: 0 });
      expect(stale.json().code).toBe('STALE');
    });

    it('features a story for the library’s front row, audited', async () => {
      const { id, lockVersion } = await created('star');
      const starred = await call('POST', `/admin/stories/${id}/feature`, { featured: true, lockVersion });
      expect(starred.statusCode, starred.body).toBe(200);
      expect(starred.json()).toMatchObject({ featured: true, featuredAt: expect.any(String), lockVersion: lockVersion + 1 });
      // featuring again keeps the first time, which the library orders by
      const again = await call('POST', `/admin/stories/${id}/feature`, { featured: true, lockVersion: starred.json().lockVersion });
      expect(again.json().featuredAt).toBe(starred.json().featuredAt);
      expect((await call('GET', '/admin/stories?featured=1')).json().stories.some((st: { id: string }) => st.id === id)).toBe(true);
      const unstarred = await call('POST', `/admin/stories/${id}/feature`, { featured: false, lockVersion: again.json().lockVersion });
      expect(unstarred.json()).toMatchObject({ featured: false, featuredAt: null });
      const audit = await pool.query(
        `SELECT before->>'featured' AS "from", after->>'featured' AS "to" FROM admin_audit_log
         WHERE target_id = $1 AND action = 'story.feature' ORDER BY created_at, id`,
        [id],
      );
      expect(audit.rows).toEqual([
        { from: 'false', to: 'true' },
        { from: 'true', to: 'true' },
        { from: 'true', to: 'false' },
      ]);
    });

    it('links two stories as versions of one story, and unlinks them', async () => {
      const a = await created('version-a');
      const b = await created('version-b', { dialect: 'sorani' });
      const linked = await call('PUT', `/admin/stories/${b.id}`, { ...testStory(slug('version-b'), { dialect: 'sorani' }), lockVersion: b.lockVersion, sameStoryAs: a.id });
      expect(linked.statusCode, linked.body).toBe(200);
      expect(linked.json().translationGroup).toEqual(expect.any(String));
      expect(linked.json().versions).toEqual([
        { id: a.id, slug: slug('version-a'), title: `Çîrok ${slug('version-a')}`, dialect: 'kurmanci', language: 'ku', status: 'draft' },
      ]);
      const other = (await call('GET', `/admin/stories/${a.id}`)).json();
      expect(other.translationGroup).toBe(linked.json().translationGroup);
      expect(other.versions.map((v: { id: string }) => v.id)).toEqual([b.id]);

      // a third joins the same group through either; a story is no version of itself, nor of nothing
      const c = await created('version-c');
      const viaB = await call('PUT', `/admin/stories/${c.id}`, { ...testStory(slug('version-c')), lockVersion: c.lockVersion, sameStoryAs: b.id });
      expect(viaB.json().versions).toHaveLength(2);
      const self = await call('PUT', `/admin/stories/${c.id}`, { ...testStory(slug('version-c')), lockVersion: viaB.json().lockVersion, sameStoryAs: c.id });
      expect(self.statusCode).toBe(400);
      const nobody = '00000000-0000-4000-8000-000000000000';
      expect((await call('PUT', `/admin/stories/${c.id}`, { ...testStory(slug('version-c')), lockVersion: viaB.json().lockVersion, sameStoryAs: nobody })).statusCode).toBe(404);
      // a save that says nothing about the group leaves it as it is; null leaves the group
      const kept = await put(c.id, testStory(slug('version-c'), { title: 'Dîsa' }), viaB.json().lockVersion);
      expect(kept.json().translationGroup).toBe(linked.json().translationGroup);
      const left = await call('PUT', `/admin/stories/${c.id}`, { ...testStory(slug('version-c')), lockVersion: kept.json().lockVersion, sameStoryAs: null });
      expect(left.json()).toMatchObject({ translationGroup: null, versions: [] });
      // a new story can be a version from the start
      const d = await call('POST', '/admin/stories', { ...testStory(slug('version-d')), sameStoryAs: a.id });
      expect(d.statusCode, d.body).toBe(201);
      expect(d.json().versions.map((v: { id: string }) => v.id).sort()).toEqual([a.id, b.id].sort());
    });

    it('links glossary terms to the dictionary when the story is saved, and lists its sentences with their recordings', async () => {
      // the fixture's glossary word as a dictionary headword, unless the dictionary has it already
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM dict_entries WHERE headword_normalized = 'cotkar' AND dialect = 'kurmanji' ORDER BY headword, id LIMIT 1`,
      );
      let entryId = existing.rows[0]?.id;
      const made = !entryId;
      if (!entryId) {
        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, letter_count)
           VALUES ('cotkar', 'cotkar', 'cotkar', 'kurmanji', 6) RETURNING id`,
        );
        entryId = inserted.rows[0]!.id;
      }
      const sentence = 'Rojîn deh salî ye.';
      const key = lessonAudioKey(sentence);
      try {
        const { id } = await created('linked');
        const got = (await call('GET', `/admin/stories/${id}`)).json();
        expect(got.glossary).toEqual([{ term: 'cotkar', meanings: { en: 'farmer' }, entryId }]);
        expect(got.glossaryMatches).toEqual([{ term: 'cotkar', entryId, headword: expect.stringMatching(/^cotkar$/i) }]);
        // a term that is no headword keeps no link, and a link a client sends is not believed
        const unlinked = await put(
          id,
          testStory(slug('linked'), { glossary: [{ term: 'rêwîtiyê', meanings: { en: 'the journey' }, entryId } as never] }),
          got.lockVersion,
        );
        expect(unlinked.statusCode, unlinked.body).toBe(200);
        expect(unlinked.json().glossary).toEqual([{ term: 'rêwîtiyê', meanings: { en: 'the journey' } }]);
        expect(unlinked.json().glossaryMatches).toEqual([]);

        // the audio section: every recordable sentence in reading order, with what the studio has recorded
        expect(got.audio).toMatchObject({ recorded: 0, total: 10 });
        expect(got.audio.sentences.map((x: { paragraph: number }) => x.paragraph)).toEqual([0, 0, 0, 0, 1, 1, 1, 2, 2, 2]);
        await pool.query(
          `INSERT INTO lesson_audio (key, text, media_key, url, content_type, duration_ms)
           VALUES ($1, $2, 'm', 'https://cdn.test/rojin.wav', 'audio/wav', 1200) ON CONFLICT (key) DO NOTHING`,
          [key, sentence],
        );
        const audio = (await call('GET', `/admin/stories/${id}`)).json().audio;
        expect(audio).toMatchObject({ recorded: 1, total: 10 });
        expect(audio.sentences[0]).toEqual({
          paragraph: 0,
          sentence: 0,
          text: sentence,
          key,
          recorded: true,
          url: 'https://cdn.test/rojin.wav',
          durationMs: 1200,
          speaker: null,
          updatedAt: expect.any(String),
        });
        expect(audio.sentences[1]).toEqual({ paragraph: 0, sentence: 1, text: 'Ew li gundekî biçûk dijî.', key: lessonAudioKey('Ew li gundekî biçûk dijî.'), recorded: false });
        expect((await call('GET', `/admin/stories?q=${slug('linked')}`)).json().stories[0].audio).toBe('partial');
      } finally {
        await pool.query(`DELETE FROM lesson_audio WHERE key = $1`, [key]);
        if (made) await pool.query(`DELETE FROM dict_entries WHERE id = $1`, [entryId]);
      }
    });
  });

  describe('categories', () => {
    const cat = (name: string) => `cat-${name}-${s}`;

    it('lists the seeded categories in order, and lets an editor add, rename and remove one', async () => {
      const seeded = (await call('GET', '/admin/story-categories')).json().categories;
      expect(seeded.slice(0, 8).map((c: { slug: string }) => c.slug)).toEqual(['folktale', 'fable', 'legend', 'family', 'village', 'nature', 'everyday', 'celebrations']);
      expect(seeded[0]).toEqual({ slug: 'folktale', name: { en: 'Folktales', ku: 'Çîrokên gelêrî', ckb: 'چیرۆکی گەلێری' }, position: 0 });

      const made = await call('POST', '/admin/story-categories', { slug: cat('songs'), name: { en: ' Songs ', ku: 'Stran', de: ' ' } });
      expect(made.statusCode, made.body).toBe(201);
      expect(made.json()).toEqual({ slug: cat('songs'), name: { en: 'Songs', ku: 'Stran' }, position: expect.any(Number) });
      expect((await call('POST', '/admin/story-categories', { slug: cat('songs'), name: { en: 'Again' } })).json().code).toBe('SLUG_TAKEN');
      expect((await call('POST', '/admin/story-categories', { slug: 'Bad Slug', name: { en: 'x' } })).statusCode).toBe(400);
      const nameless = await call('POST', '/admin/story-categories', { slug: cat('none'), name: { en: ' ', fr: 'Chansons' } });
      expect(nameless.statusCode).toBe(422);
      expect(nameless.json().details.errors.map((e: { code: string }) => e.code)).toEqual(['CATEGORY_NAME_EMPTY']);
      const odd = await call('POST', '/admin/story-categories', { slug: cat('odd'), name: { en: 'Odd', xx: 'Odd' } });
      expect(odd.json().details.errors[0].code).toBe('CATEGORY_LOCALE');
      // readers see it at once
      const pub = await app.inject({ method: 'GET', url: '/stories/categories' });
      expect(pub.json().categories.some((c: { slug: string }) => c.slug === cat('songs'))).toBe(true);

      const renamed = await call('PUT', `/admin/story-categories/${cat('songs')}`, { name: { en: 'Songs and rhymes' }, position: 99 });
      expect(renamed.statusCode, renamed.body).toBe(200);
      expect(renamed.json()).toEqual({ slug: cat('songs'), name: { en: 'Songs and rhymes' }, position: 99 });
      expect((await call('PUT', `/admin/story-categories/${cat('missing')}`, { name: { en: 'x' } })).statusCode).toBe(404);

      // a story filed under it: deleting is refused with the count, unless forced, which leaves the story unfiled
      const { id } = await created('filed', { category: cat('songs') });
      const refused = await call('DELETE', `/admin/story-categories/${cat('songs')}`);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ code: 'IN_USE', details: { count: 1 } });
      expect((await call('GET', `/admin/stories/${id}`)).json().category).toBe(cat('songs'));
      const forced = await call('DELETE', `/admin/story-categories/${cat('songs')}?force=1`);
      expect(forced.statusCode, forced.body).toBe(200);
      expect(forced.json()).toEqual({ slug: cat('songs'), deleted: true, unfiled: 1 });
      const unfiled = (await call('GET', `/admin/stories/${id}`)).json();
      expect(unfiled.category).toBeNull();
      expect(unfiled.problems.errors.map((e: { code: string }) => e.code)).toEqual(['CATEGORY_MISSING']);
      expect((await call('DELETE', `/admin/story-categories/${cat('songs')}`)).statusCode).toBe(404);
      const audit = await pool.query(
        `SELECT action FROM admin_audit_log WHERE target_type = 'story_category' AND target_id = $1 ORDER BY created_at, id`,
        [cat('songs')],
      );
      expect(audit.rows.map((r) => r.action)).toEqual(['story.category.create', 'story.category.update', 'story.category.delete']);

      // a story cannot be filed under a category that is not there
      const nowhere = await call('POST', '/admin/stories', testStory(slug('nowhere'), { category: cat('missing') }));
      expect(nowhere.statusCode).toBe(422);
      expect(nowhere.json().details.errors[0]).toMatchObject({ code: 'CATEGORY_UNKNOWN', path: 'category' });
    });
  });
});
