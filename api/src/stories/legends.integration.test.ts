/**
 * Legend stories against real Postgres: a saga in sections with per-language title and summary, reflection questions,
 * notes, sources and translated questions, as the reader, library filter and after-reading check get them; and one
 * language of a published story corrected and reviewed on its own without going offline or losing approval.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { STORY_ASSESSMENT, storyParagraphs, type StoryDetail, type StoryGameView, type StoryListItem } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { testStory, type TestStory } from '../test/stories.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('stories that hold a legend (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  const userIds: string[] = [];
  const net = Math.floor(Math.random() * 250);
  let editor = '';
  let editorId = '';
  let learner = '';
  const slug = (name: string) => `leg-${name}-${s}`;

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
      remoteAddress: `10.98.${net}.${userIds.length + 1}`,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token, '10.98.0.2');
    return { token, id };
  }

  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown, token: string | null = editor) =>
    app.inject({ method, url, payload: payload as never, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.98.0.3' });
  const version = async (id: string): Promise<number> => (await call('GET', `/admin/stories/${id}`)).json().lockVersion;
  const act = async (id: string, action: string) => call('POST', `/admin/stories/${id}/${action}`, { lockVersion: await version(id) });
  const approve = async (id: string) => call('POST', `/admin/stories/${id}/review`, { approved: true, lockVersion: await version(id) });

  /** A saga with everything a legend carries, the questions translated into German with their options marked. */
  function legend(name: string, over: Partial<TestStory> = {}): TestStory {
    const base = testStory(slug(name), { length: 'saga', tradition: 'traditional', ...over });
    const english = storyParagraphs(base.body).map((p, i) => (p.startsWith('## ') ? `## Part ${i}` : `English paragraph ${i}.`));
    return {
      ...base,
      translations: { en: english.join('\n\n') },
      questions: base.questions.map((q) => ({
        ...q,
        translations: { de: { prompt: `DE ${q.prompt}`, options: q.options.map((o) => `DE ${o}`), explanation: 'DE Erklärung.' } },
      })),
      metaTranslations: { en: { title: 'The legend', summary: 'A long telling.' } },
      reflections: [
        { text: 'Tu çi difikirî?', translations: { en: 'What do you think?' } },
        { text: 'Kî rast bû?', translations: {} },
        { text: 'Çima?', translations: {} },
      ],
      notes: [{ kind: 'legend', title: 'Efsane', body: 'Ev efsane ye, ne dîrok.', translations: { en: { title: 'Legend', body: 'This is a legend, not history.' } } }],
      sources: [
        { title: 'Mem û Zîn', author: 'Ehmedê Xanî', type: 'literary', url: 'https://example.org/mem-u-zin' },
        { title: 'Dengbêjên Botanê', type: 'oral' },
      ],
      ...over,
    } as TestStory;
  }

  /** created, approved and published through the admin routes */
  async function published(name: string): Promise<{ id: string; story: TestStory }> {
    const story = legend(name);
    const res = await call('POST', '/admin/stories', story);
    expect(res.statusCode, res.body).toBe(201);
    const id = res.json().id as string;
    expect((await approve(id)).statusCode).toBe(200);
    const live = await act(id, 'publish');
    expect(live.statusCode, live.body).toBe(200);
    expect(live.json().status).toBe('published');
    return { id, story };
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    ({ token: editor, id: editorId } = await register('legEditor', '{content_editor}'));
    ({ token: learner } = await register('legLearner', '{}'));
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM story_games WHERE story_id IN (SELECT id FROM stories WHERE slug LIKE $1)`, [`%-${s}`]);
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

  describe('a saga as the reader gets it', () => {
    it('sends its sections, reflections, notes, sources and translated title, and never who reviewed what', async () => {
      const { id } = await published('read');
      const res = await call('GET', `/stories/${slug('read')}`, undefined, null);
      expect(res.statusCode, res.body).toBe(200);
      const story = res.json() as StoryDetail;
      expect(story.length).toBe('saga');
      expect(story.sections).toEqual([
        { title: 'Beşa yekem', paragraph: 3 },
        { title: 'Beşa duyem', paragraph: 13 },
      ]);
      // the headings are paragraphs of their own, as the reader cuts the text, and narrate nothing
      expect(story.paragraphs[3]).toBe('## Beşa yekem');
      expect(story.translations.en![3]).toBe('## Part 3');
      expect(story.metaTranslations).toEqual({ en: { title: 'The legend', summary: 'A long telling.' } });
      expect(story.reflections).toHaveLength(3);
      expect(story.reflections[0]).toEqual({ text: 'Tu çi difikirî?', translations: { en: 'What do you think?' } });
      expect(story.notes).toEqual([
        { kind: 'legend', title: 'Efsane', body: 'Ev efsane ye, ne dîrok.', translations: { en: { title: 'Legend', body: 'This is a legend, not history.' } } },
      ]);
      expect(story.sources).toEqual([
        { title: 'Mem û Zîn', author: 'Ehmedê Xanî', type: 'literary', url: 'https://example.org/mem-u-zin' },
        { title: 'Dengbêjên Botanê', type: 'oral' },
      ]);
      expect(JSON.stringify(story)).not.toContain('translationReview');
      // nor the questions, translated or not
      expect(JSON.stringify(story)).not.toContain('DE Pirs');

      // the editor sees the review of each language: nobody has read the English yet
      const admin = (await call('GET', `/admin/stories/${id}`)).json();
      expect(admin.translationReview).toEqual({ en: { status: 'unreviewed' }, de: { status: 'unreviewed' } });
      expect(admin.questions[0].translations.de.options).toEqual(['DE Yek 0', 'DE Du 0', 'DE Sê 0']);
    });

    it('filters the library by the saga length', async () => {
      await published('filter');
      const res = await call('GET', '/stories?length=saga&limit=50', undefined, null);
      expect(res.statusCode, res.body).toBe(200);
      const mine = (res.json().stories as StoryListItem[]).filter((st) => st.slug.endsWith(`-${s}`));
      expect(mine.map((st) => st.slug)).toContain(slug('filter'));
      expect(mine.every((st) => st.length === 'saga')).toBe(true);
      expect(mine.find((st) => st.slug === slug('filter'))!.metaTranslations).toEqual({ en: { title: 'The legend', summary: 'A long telling.' } });
      expect((await call('GET', '/stories?length=epic', undefined, null)).statusCode).toBe(400);
    });

    it('refuses to publish a saga without two sections, and lets the draft wait for them', async () => {
      const flat = legend('flat');
      const body = flat.body.split('\n\n').filter((p) => p !== '## Beşa duyem').join('\n\n');
      const res = await call('POST', '/admin/stories', {
        ...flat,
        body,
        translations: {},
        questions: flat.questions.map((q) => ({ ...q, translations: {} })),
      });
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json().problems.errors.map((e: { code: string }) => e.code)).toEqual(['SAGA_SECTIONS']);
      await approve(res.json().id);
      const refused = await act(res.json().id, 'publish');
      expect(refused.statusCode).toBe(422);
      expect(refused.json().details.errors.map((e: { code: string }) => e.code)).toEqual(['SAGA_SECTIONS']);
    });
  });

  describe('correcting one language', () => {
    it('saves a language of a published story without taking it offline or its approval away, and marks it unreviewed', async () => {
      const { id, story } = await published('fix');
      // a reader has the list cached before the fix
      expect((await call('GET', `/stories?length=saga&limit=50`, undefined, null)).statusCode).toBe(200);

      const german = storyParagraphs(story.body).map((p, i) => (p.startsWith('## ') ? `## Teil ${i}` : `Deutscher Absatz ${i}.`));
      const res = await call('PUT', `/admin/stories/${id}/translations/de`, {
        lockVersion: await version(id),
        body: german.join('\n\n'),
        title: 'Die Legende',
        summary: 'Eine lange Erzählung.',
        reflections: ['Was denkst du?', null, null],
        notes: [{ title: 'Legende', body: 'Eine Legende, keine Geschichte.' }],
      });
      expect(res.statusCode, res.body).toBe(200);
      const after = res.json();
      expect(after).toMatchObject({ status: 'published', reviewStatus: 'approved' });
      expect(after.translationReview.de).toEqual({ status: 'unreviewed' });
      expect(after.metaTranslations.de).toEqual({ title: 'Die Legende', summary: 'Eine lange Erzählung.' });
      // the question translations were not sent, so they are as they were
      expect(after.questions[0].translations.de.prompt).toBe('DE Pirs 1?');

      // learners have it at once: the detail, and the list a moment ago cached
      const read = (await call('GET', `/stories/${slug('fix')}`, undefined, null)).json() as StoryDetail;
      expect(read.translations.de![0]).toBe('Deutscher Absatz 0.');
      expect(read.translations.de![3]).toBe('## Teil 3');
      expect(read.reflections[0]!.translations.de).toBe('Was denkst du?');
      expect(read.notes[0]!.translations.de).toEqual({ title: 'Legende', body: 'Eine Legende, keine Geschichte.' });
      const listed = ((await call('GET', `/stories?length=saga&limit=50`, undefined, null)).json().stories as StoryListItem[]).find(
        (st) => st.slug === slug('fix'),
      );
      expect(listed!.metaTranslations.de).toEqual({ title: 'Die Legende', summary: 'Eine lange Erzählung.' });

      // audited, with the language before and after
      const audit = await pool.query(`SELECT action, before, after FROM admin_audit_log WHERE target_id = $1 AND action = 'story.translation'`, [id]);
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].after).toMatchObject({ locale: 'de', status: 'published', review: { status: 'unreviewed' } });
    });

    it('takes the questions in a language one for each, and removes a part sent as null', async () => {
      const { id, story } = await published('questions');
      const questions = story.questions.map((q) => ({ prompt: `FR ${q.prompt}`, options: q.options.map((o) => `FR ${o}`) }));
      const saved = await call('PUT', `/admin/stories/${id}/translations/fr`, { lockVersion: await version(id), questions });
      expect(saved.statusCode, saved.body).toBe(200);
      expect(saved.json().questions[2].translations.fr).toEqual({ prompt: 'FR Pirs 3?', options: ['FR Yek 2', 'FR Du 2', 'FR Sê 2'] });
      // the question ids stay: a game's plan names them
      const ids = (await call('GET', `/admin/stories/${id}`)).json().questions.map((q: { id: string }) => q.id);
      expect(saved.json().questions.map((q: { id: string }) => q.id)).toEqual(ids);

      const short = await call('PUT', `/admin/stories/${id}/translations/fr`, { lockVersion: await version(id), questions: questions.slice(1) });
      expect(short.statusCode).toBe(422);
      expect(short.json().details.errors.map((e: { code: string }) => e.code)).toEqual(['TRANSLATION_COUNT']);
      const options = await call('PUT', `/admin/stories/${id}/translations/fr`, {
        lockVersion: await version(id),
        questions: questions.map((q, i) => (i === 0 ? { ...q, options: q.options.slice(0, 2) } : q)),
      });
      expect(options.statusCode).toBe(422);
      expect(options.json().details.errors).toEqual([expect.objectContaining({ code: 'QUESTION_TRANSLATION_OPTIONS', path: 'questions[0].translations.fr.options' })]);
      const misaligned = await call('PUT', `/admin/stories/${id}/translations/fr`, { lockVersion: await version(id), body: 'Un.\n\nDeux.' });
      expect(misaligned.statusCode).toBe(422);
      expect(misaligned.json().details.errors.map((e: { code: string }) => e.code)).toEqual(['TRANSLATION_PARAGRAPHS']);

      // the English text removed: the rest of the English stays
      const removed = await call('PUT', `/admin/stories/${id}/translations/en`, { lockVersion: await version(id), body: null });
      expect(removed.statusCode, removed.body).toBe(200);
      expect(removed.json().translations.en).toBeUndefined();
      expect(removed.json().metaTranslations.en).toEqual({ title: 'The legend', summary: 'A long telling.' });
      expect(removed.json().reviewStatus).toBe('approved');
    });

    it('refuses a stale copy, a language the app is not offered in, and an archived story', async () => {
      const { id } = await published('refuse');
      const stale = await call('PUT', `/admin/stories/${id}/translations/de`, { lockVersion: 0, title: 'Alt' });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().code).toBe('STALE');
      expect((await call('PUT', `/admin/stories/${id}/translations/xx`, { lockVersion: await version(id), title: 'X' })).statusCode).toBe(400);
      // a learner is not shown the admin at all
      expect((await call('PUT', `/admin/stories/${id}/translations/de`, { lockVersion: await version(id), title: 'X' }, learner)).statusCode).toBe(404);
      expect((await act(id, 'archive')).statusCode).toBe(200);
      const archived = await call('PUT', `/admin/stories/${id}/translations/de`, { lockVersion: await version(id), title: 'Spät' });
      expect(archived.statusCode).toBe(409);
      expect(archived.json().code).toBe('NOT_EDITABLE');
    });

    it('records a native speaker’s review of a language, with who and when', async () => {
      const { id } = await published('review');
      const reviewed = await call('POST', `/admin/stories/${id}/translations/en/review`, { status: 'reviewed', note: 'Read it all.', lockVersion: await version(id) });
      expect(reviewed.statusCode, reviewed.body).toBe(200);
      expect(reviewed.json().translationReview.en).toEqual({ status: 'reviewed', by: editorId, at: expect.any(String), note: 'Read it all.' });
      expect(reviewed.json()).toMatchObject({ status: 'published', reviewStatus: 'approved' });
      const back = await call('POST', `/admin/stories/${id}/translations/en/review`, { status: 'unreviewed', lockVersion: await version(id) });
      expect(back.json().translationReview.en).toMatchObject({ status: 'unreviewed', by: editorId });
      // a language with nothing in it has nothing to review
      const nothing = await call('POST', `/admin/stories/${id}/translations/tr/review`, { status: 'reviewed', lockVersion: await version(id) });
      expect(nothing.statusCode).toBe(409);
      expect(nothing.json().code).toBe('NOTHING_TO_REVIEW');
      const audit = await pool.query(`SELECT count(*)::int AS n FROM admin_audit_log WHERE target_id = $1 AND action = 'story.translation.review'`, [id]);
      expect(audit.rows[0].n).toBe(2);

      // a correction to the reviewed language makes it unreviewed again; the others keep theirs
      await call('POST', `/admin/stories/${id}/translations/en/review`, { status: 'reviewed', lockVersion: await version(id) });
      await call('POST', `/admin/stories/${id}/translations/de/review`, { status: 'reviewed', lockVersion: await version(id) });
      const fixed = await call('PUT', `/admin/stories/${id}/translations/en`, { lockVersion: await version(id), title: 'The legend, retold' });
      expect(fixed.json().translationReview.en).toEqual({ status: 'unreviewed' });
      expect(fixed.json().translationReview.de).toMatchObject({ status: 'reviewed', by: editorId });
    });

    it('keeps the whole-story save as it was: a changed translation there is content, and only its language goes back to unreviewed', async () => {
      const story = legend('whole');
      const created = (await call('POST', '/admin/stories', story)).json();
      await call('POST', `/admin/stories/${created.id}/translations/de/review`, { status: 'reviewed', lockVersion: await version(created.id) });
      await approve(created.id);
      const english = story.translations.en!.replace('English paragraph 0.', 'English paragraph zero.');
      const res = await call('PUT', `/admin/stories/${created.id}`, { ...story, translations: { en: english }, lockVersion: await version(created.id) });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().reviewStatus).toBe('unreviewed');
      expect(res.json().translationReview).toEqual({ en: { status: 'unreviewed' }, de: expect.objectContaining({ status: 'reviewed' }) });
      // an editor opened before legends existed sends none of what a legend carries: it is kept, and the translations of
      // a question whose Kurdish it did not change with it
      const older: Partial<TestStory> = { ...story };
      for (const key of ['metaTranslations', 'reflections', 'notes', 'sources'] as const) delete older[key];
      const questions = story.questions.map(({ translations: _t, ...q }, i) => (i === 1 ? { ...q, prompt: 'Pirsa nû?' } : q));
      const kept = await call('PUT', `/admin/stories/${created.id}`, { ...older, translations: { en: english }, questions, lockVersion: await version(created.id) });
      expect(kept.statusCode, kept.body).toBe(200);
      expect(kept.json()).toMatchObject({ metaTranslations: story.metaTranslations, reflections: story.reflections, notes: story.notes, sources: story.sources });
      expect(kept.json().questions[0].translations.de.prompt).toBe('DE Pirs 1?');
      expect(kept.json().questions[1].translations).toEqual({});
      // and a published story is still not edited that way
      await approve(created.id);
      await act(created.id, 'publish');
      const refused = await call('PUT', `/admin/stories/${created.id}`, { ...story, lockVersion: await version(created.id) });
      expect(refused.json().code).toBe('NOT_EDITABLE');
    });
  });

  describe('the after-reading check', () => {
    it('carries each question in the reader’s languages, its options in the game’s order, the explanation only at the reveal', async () => {
      const { id } = await published('check');
      const created = await call('POST', '/story-games', { ...STORY_ASSESSMENT, storyId: id }, learner);
      expect(created.statusCode, created.body).toBe(201);
      let view = created.json() as StoryGameView;
      expect(view.settings.length).toBe('saga');
      for (let i = 0; i < STORY_ASSESSMENT.questionCount; i++) {
        const q = view.question!;
        expect(q.translations.de!.prompt).toBe(`DE ${q.prompt}`);
        // the same index is the same option in every language
        expect(q.translations.de!.options).toEqual(q.options.map((o) => `DE ${o}`));
        expect(q.translations.de).not.toHaveProperty('explanation');
        view = (await call('POST', `/story-games/${view.id}/answers`, { index: i, choice: 0 }, learner)).json();
        expect(view.reveal!.translations.de).toEqual({ prompt: `DE ${q.prompt}`, options: q.options.map((o) => `DE ${o}`), explanation: 'DE Erklärung.' });
        if (i < STORY_ASSESSMENT.questionCount - 1) view = (await call('POST', `/story-games/${view.id}/continue`, { index: i }, learner)).json();
      }
      expect(view.results!.review).toHaveLength(5);
      for (const item of view.results!.review) expect(item.translations.de!.options).toEqual(item.options.map((o) => `DE ${o}`));

      // the game's own copy of the text has the sections, and the rest from the live story
      const text = await call('GET', `/story-games/${view.id}/story`, undefined, learner);
      expect(text.statusCode, text.body).toBe(200);
      const gameStory = text.json() as StoryDetail;
      expect(gameStory.sections.map((sec) => sec.title)).toEqual(['Beşa yekem', 'Beşa duyem']);
      expect(gameStory.reflections).toHaveLength(3);
      expect(gameStory.metaTranslations.en!.title).toBe('The legend');
    });
  });
});
