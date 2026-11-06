/**
 * The story library against real Postgres: the front page for everyone and
 * for a signed-in reader, the reader's shelf and reading position, their
 * shelves at /me/stories, the other versions of a story, and the glossary's
 * dictionary links as the reader gets them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { StoryLibrary, StoryListItem } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { Cache } from '../cache/cache.js';
import { createRedis } from '../cache/redis.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { testStory, type TestStory } from '../test/stories.js';
import { StoryAdminService } from './admin-service.js';
import { storyInputFrom } from './schema.js';
import { bustStoryLists } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('story library (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let admin: StoryAdminService;
  let cache: Cache | null = null;
  let redis: ReturnType<typeof createRedis> | null = null;
  const s = Date.now().toString(36);
  const userIds: string[] = [];
  const net = Math.floor(Math.random() * 250);
  let editorId = '';
  let learner = '';
  let learnerId = '';
  const ids: Record<string, string> = {};
  const slug = (name: string) => `lib-${name}-${s}`;
  let dictEntry: { id: string; made: boolean } | null = null;

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
      remoteAddress: `10.97.${net}.${userIds.length + 1}`,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token, '10.97.0.2');
    return { token, id };
  }

  /** create through the admin service, approve, and publish unless told otherwise */
  async function story(name: string, over: Partial<TestStory> = {}, options: { publish?: boolean; sameStoryAs?: string } = {}) {
    const { slug: storySlug, ...content } = testStory(slug(name), over);
    const created = await admin.create({ ...storyInputFrom(content as never), slug: storySlug }, { adminId: editorId }, { sameStoryAs: options.sameStoryAs });
    if (options.publish !== false) {
      const approved = await admin.review(created.id, { approved: true }, { adminId: editorId, lockVersion: created.lockVersion });
      await admin.transition(created.id, 'publish', { adminId: editorId, lockVersion: approved.lockVersion });
    }
    ids[name] = created.id;
    return created.id;
  }

  const call = (method: 'GET' | 'PUT' | 'DELETE', url: string, token?: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.97.0.3' });
  const ours = (stories: StoryListItem[]) => stories.filter((st) => st.slug.endsWith(`-${s}`));
  const library = async (token?: string): Promise<StoryLibrary> => {
    const res = await call('GET', '/stories/library', token);
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    if (config.REDIS_URL) {
      redis = createRedis(config);
      cache = new Cache(redis);
      if (redis.status !== 'ready') await new Promise((ready) => redis!.once('ready', ready));
    }
    admin = new StoryAdminService(pool, cache);
    ({ id: editorId } = await register('libEditor', '{content_editor}'));
    ({ token: learner, id: learnerId } = await register('libLearner', '{}'));

    // the fixture's glossary word as a dictionary headword, so a story saved from here on is linked to it
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM dict_entries WHERE headword_normalized = 'cotkar' AND dialect = 'kurmanji' ORDER BY headword, id LIMIT 1`,
    );
    if (existing.rows[0]) {
      dictEntry = { id: existing.rows[0].id, made: false };
    } else {
      const inserted = await pool.query<{ id: string }>(
        `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, letter_count)
         VALUES ('cotkar', 'cotkar', 'cotkar', 'kurmanji', 6) RETURNING id`,
      );
      dictEntry = { id: inserted.rows[0]!.id, made: true };
      await pool.query(`INSERT INTO dict_senses (entry_id, position, pos, definition_en) VALUES ($1, 0, 'noun', 'farmer')`, [dictEntry.id]);
      await pool.query(`INSERT INTO dict_audio (entry_id, audio_url, dialect) VALUES ($1, 'https://cdn.test/cotkar.wav', 'kurmanji')`, [dictEntry.id]);
    }

    await story('a', { title: `A ${s}`, category: 'fable' });
    await story('b', { title: `B ${s}`, category: 'fable', level: 2 });
    await story('c', { title: `C ${s}`, dialect: 'sorani', category: 'village' });
    await story('sorani-a', { title: `A (Soranî) ${s}`, dialect: 'sorani' }, { sameStoryAs: ids.a });
    await story('draft', {}, { publish: false });
    const starred = await admin.get(ids.a!);
    await admin.feature(ids.a!, true, { adminId: editorId, lockVersion: starred!.lockVersion });
    await bustStoryLists(cache);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM stories WHERE slug LIKE $1`, [`%-${s}`]);
    if (dictEntry?.made) await pool.query(`DELETE FROM dict_entries WHERE id = $1`, [dictEntry.id]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await bustStoryLists(cache);
    redis?.disconnect();
    await pool.end();
    await app.close();
  });

  describe('GET /stories/library', () => {
    it('shows everyone the featured and recent stories, the categories with their counts, and the total', async () => {
      const lib = await library();
      expect(ours(lib.featured).map((st) => st.slug)).toEqual([slug('a')]);
      expect(lib.featured.length).toBeLessThanOrEqual(8);
      expect(ours(lib.recent).map((st) => st.slug).sort()).toEqual([slug('a'), slug('b'), slug('c'), slug('sorani-a')].sort());
      // recent is latest first, and never a draft
      const published = lib.recent.map((st) => st.publishedAt!);
      expect(published).toEqual([...published].sort().reverse());
      expect(lib.recent.some((st) => st.slug === slug('draft'))).toBe(false);
      expect(lib.categories.map((c) => c.slug).slice(0, 8)).toEqual(['folktale', 'fable', 'legend', 'family', 'village', 'nature', 'everyday', 'celebrations']);
      expect(lib.categories.find((c) => c.slug === 'fable')!.count).toBeGreaterThanOrEqual(2);
      expect(lib.categories.find((c) => c.slug === 'folktale')).toMatchObject({ name: { en: 'Folktales', ku: 'Çîrokên gelêrî' }, position: 0 });
      expect(lib.total).toBeGreaterThanOrEqual(4);
      // the levels that have a story, in order, which add up to the total; a draft counts at none
      const levels = lib.levels ?? [];
      expect(levels.map((l) => l.level)).toEqual([...levels.map((l) => l.level)].sort());
      expect(levels.every((l) => l.count > 0)).toBe(true);
      expect(levels.reduce((sum, l) => sum + l.count, 0)).toBe(lib.total);
      expect(levels.find((l) => l.level === 2)?.count).toBeGreaterThanOrEqual(1);
      // nothing personal for nobody
      expect(lib.continue).toEqual([]);
      expect(lib.bookmarks).toEqual([]);
      expect(lib).not.toHaveProperty('me');
      expect(lib.recent.some((st) => 'me' in st)).toBe(false);
    });

    it('adds a signed-in reader’s own rows and tally, on every story on the page', async () => {
      const lib = await library(learner);
      expect(lib.me).toEqual({ finished: 0, total: lib.total, averageScore: null });
      expect(lib.continue).toEqual([]);
      expect(lib.bookmarks).toEqual([]);
      for (const st of [...lib.featured, ...lib.recent]) {
        expect(st.me).toEqual({ bookmarked: false, paragraph: 0, share: 0, finishedAt: null, bestCorrect: null, total: null, attemptsToday: 0 });
      }
    });
  });

  describe('the reader’s shelf and place', () => {
    it('bookmarks a story and takes it off again, for a published story only', async () => {
      expect((await call('PUT', `/stories/${ids.b}/bookmark`)).statusCode).toBe(401);
      const on = await call('PUT', `/stories/${ids.b}/bookmark`, learner);
      expect(on.statusCode, on.body).toBe(200);
      expect(on.json()).toEqual({ bookmarked: true });
      // saying so twice changes nothing
      expect((await call('PUT', `/stories/${ids.b}/bookmark`, learner)).json()).toEqual({ bookmarked: true });
      expect((await call('GET', `/stories/${slug('b')}`, learner)).json().me.bookmarked).toBe(true);
      const lib = await library(learner);
      expect(lib.bookmarks.map((st) => st.slug)).toEqual([slug('b')]);
      expect(lib.bookmarks[0]!.me!.bookmarked).toBe(true);
      expect(lib.recent.find((st) => st.slug === slug('b'))!.me!.bookmarked).toBe(true);

      const off = await call('DELETE', `/stories/${ids.b}/bookmark`, learner);
      expect(off.json()).toEqual({ bookmarked: false });
      expect((await library(learner)).bookmarks).toEqual([]);
      for (const notThere of [ids.draft, '00000000-0000-4000-8000-000000000000']) {
        expect((await call('PUT', `/stories/${notThere}/bookmark`, learner)).statusCode).toBe(404);
      }
      expect((await call('PUT', '/stories/not-a-uuid/bookmark', learner)).statusCode).toBe(400);
    });

    it('remembers where the reader is, finishes once and never unfinishes, and shows the shelves', async () => {
      const progress = (id: string, body: unknown) => call('PUT', `/stories/${id}/progress`, learner, body);
      expect((await call('PUT', `/stories/${ids.a}/progress`, undefined, { paragraph: 1, share: 0.4 })).statusCode).toBe(401);
      const started = await progress(ids.a!, { paragraph: 1, share: 0.4 });
      expect(started.statusCode, started.body).toBe(200);
      expect(started.json().me).toMatchObject({ paragraph: 1, finishedAt: null, bookmarked: false });
      expect(started.json().me.share).toBeCloseTo(0.4, 5);
      let lib = await library(learner);
      expect(lib.continue.map((st) => st.slug)).toEqual([slug('a')]);
      expect(lib.me!.finished).toBe(0);

      // the position moves both ways; past 95 percent the story is finished
      expect((await progress(ids.a!, { paragraph: 0, share: 0.1 })).json().me.paragraph).toBe(0);
      const done = await progress(ids.a!, { paragraph: 2, share: 0.97 });
      expect(done.json().me).toMatchObject({ paragraph: 2, finishedAt: expect.any(String) });
      const finishedAt = done.json().me.finishedAt;
      // reading it again from the top keeps the finish
      const again = await progress(ids.a!, { paragraph: 0, share: 0.05 });
      expect(again.json().me).toMatchObject({ paragraph: 0, finishedAt });
      // the client may say so outright, below the mark
      expect((await progress(ids.b!, { paragraph: 1, share: 0.5, finished: true })).json().me.finishedAt).toEqual(expect.any(String));

      lib = await library(learner);
      expect(lib.continue).toEqual([]);
      expect(lib.me).toMatchObject({ finished: 2, total: lib.total });
      expect(lib.recent.find((st) => st.slug === slug('a'))!.me!.finishedAt).toBe(finishedAt);

      // the shelves, latest first
      await progress(ids.c!, { paragraph: 0, share: 0.2 });
      await call('PUT', `/stories/${ids.b}/bookmark`, learner);
      const mine = await call('GET', '/me/stories', learner);
      expect(mine.statusCode, mine.body).toBe(200);
      expect(mine.json().continue.map((st: StoryListItem) => st.slug)).toEqual([slug('c')]);
      expect(mine.json().bookmarks.map((st: StoryListItem) => st.slug)).toEqual([slug('b')]);
      expect(mine.json().finished.map((st: StoryListItem) => st.slug)).toEqual([slug('b'), slug('a')]);
      expect(mine.json().finished[0].me).toMatchObject({ bookmarked: true, finishedAt: expect.any(String) });
      expect((await call('GET', '/me/stories')).statusCode).toBe(401);

      // what cannot be a position, and a story nobody may read
      for (const bad of [{ paragraph: -1, share: 0.5 }, { paragraph: 1, share: 2 }, { paragraph: 'two', share: 0.5 }, {}]) {
        expect((await progress(ids.a!, bad)).statusCode).toBe(400);
      }
      expect((await progress(ids.draft!, { paragraph: 0, share: 0 })).statusCode).toBe(404);
      const row = await pool.query(`SELECT count(*)::int n FROM story_reading WHERE user_id = $1`, [learnerId]);
      expect(row.rows[0].n).toBe(3);
    });

    it('refuses more than sixty position writes a minute from one reader', async () => {
      // the client writes once every ten seconds; a loop would fill the table
      const codes: number[] = [];
      for (let i = 0; i < 61; i++) {
        codes.push((await call('PUT', `/stories/${ids.c}/progress`, learner, { paragraph: 0, share: 0.3 })).statusCode);
      }
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(1);
      expect(codes.slice(0, 20).every((c) => c === 200)).toBe(true);
    });
  });

  describe('GET /stories/:idOrSlug', () => {
    it('lists the other published versions of the story, and links the glossary to the dictionary', async () => {
      const a = (await call('GET', `/stories/${slug('a')}`)).json();
      expect(a.versions).toEqual([{ id: ids['sorani-a'], slug: slug('sorani-a'), dialect: 'sorani', language: 'ku' }]);
      const sorani = (await call('GET', `/stories/${slug('sorani-a')}`)).json();
      expect(sorani.versions).toEqual([{ id: ids.a, slug: slug('a'), dialect: 'kurmanci', language: 'ku' }]);
      // a version nobody may read is no version: unpublished, it leaves the other's list at once
      const current = await admin.get(ids['sorani-a']!);
      await admin.transition(ids['sorani-a']!, 'unpublish', { adminId: editorId, lockVersion: current!.lockVersion });
      expect((await call('GET', `/stories/${slug('a')}`)).json().versions).toEqual([]);

      // the gloss carries the dictionary entry it was linked to when the story was saved, with what the dictionary says now
      expect(a.glossary).toHaveLength(1);
      expect(a.glossary[0]).toMatchObject({ term: 'cotkar', meanings: { en: 'farmer' }, entryId: dictEntry!.id });
      if (dictEntry!.made) expect(a.glossary[0]).toMatchObject({ pos: 'noun', audioUrl: 'https://cdn.test/cotkar.wav' });
      // a Soranî story's glossary is empty in the fixture: nothing to link
      expect(sorani.glossary).toEqual([]);
    });

    it('answers the categories for a filter list', async () => {
      const res = await call('GET', '/stories/categories');
      expect(res.statusCode).toBe(200);
      expect(res.json().categories.slice(0, 2)).toEqual([
        { slug: 'folktale', name: { en: 'Folktales', ku: 'Çîrokên gelêrî', ckb: 'چیرۆکی گەلێری' }, position: 0 },
        { slug: 'fable', name: { en: 'Animal fables', ku: 'Çîrokên heywanan', ckb: 'چیرۆکی ئاژەڵان' }, position: 1 },
      ]);
    });
  });
});
