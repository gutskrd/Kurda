/**
 * Reading stories and the story games' way in, against real Postgres: only
 * published stories, in the hub's order, never their questions; the cached
 * list and what empties it; one story by slug or id with its recordings; and
 * the published story with its bank that a game builds its plan from.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { lessonAudioKey, type StoryListItem } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { Cache } from '../cache/cache.js';
import { createRedis } from '../cache/redis.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { testStory, type TestStory } from '../test/stories.js';
import { StoryAdminService } from './admin-service.js';
import { storyInputFrom } from './schema.js';
import { StoriesService, bustStoryLists } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('stories (integration)', () => {
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
  const ids: Record<string, string> = {};
  const slug = (name: string) => `pub-${name}-${s}`;
  const recorded: string[] = [];

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
      remoteAddress: `10.95.${net}.${userIds.length + 1}`,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token, '10.95.0.2');
    return { token, id };
  }

  /** create through the admin service, and publish unless told otherwise */
  async function story(name: string, over: Partial<TestStory> & { length?: 'short' | 'medium' | 'long' } = {}, publish = true) {
    const { slug: storySlug, ...content } = testStory(slug(name), over);
    const created = await admin.create({ ...storyInputFrom(content as never), slug: storySlug }, { adminId: editorId });
    if (publish) await admin.transition(created.id, 'publish', { adminId: editorId, lockVersion: created.lockVersion });
    ids[name] = created.id;
    return created.id;
  }

  /** a status change as the admin panel makes it: with the version it has just loaded */
  async function act(id: string, action: 'submit' | 'publish' | 'unpublish' | 'archive') {
    return admin.transition(id, action, { adminId: editorId, lockVersion: (await admin.get(id))!.lockVersion });
  }

  const get = (url: string, token?: string) =>
    app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.95.0.3' });
  const ours = (stories: StoryListItem[]) => stories.filter((st) => st.slug.endsWith(`-${s}`));
  const list = async (query = ''): Promise<StoryListItem[]> => {
    const res = await get(`/stories${query}`);
    expect(res.statusCode, res.body).toBe(200);
    return ours(res.json().stories);
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // the suite's own handle on the app's cache, to empty it the way an admin action does
    if (config.REDIS_URL) {
      redis = createRedis(config);
      cache = new Cache(redis);
      // commands are refused, not queued, until it is connected
      if (redis.status !== 'ready') await new Promise((ready) => redis!.once('ready', ready));
    }
    admin = new StoryAdminService(pool, cache);
    ({ id: editorId } = await register('rdEditor', '{content_editor}'));
    ({ token: learner } = await register('rdLearner', '{}'));

    // a level-2 medium, a level-1 long, two level-1 shorts out of title order, a Soranî one, and some not published
    await story('medium-l2', { level: 2, length: 'medium', title: `A ${s}` });
    await story('long-l1', { level: 1, length: 'long', title: `B ${s}` });
    await story('short-b', { title: `D ${s}` });
    await story('short-a', { title: `C ${s}` });
    await story('sorani', { dialect: 'sorani', title: `E ${s}` });
    await story('draft', {}, false);
    const review = await story('review', {}, false);
    await act(review, 'submit');
    const archived = await story('archived');
    await act(archived, 'archive');
    await bustStoryLists(cache);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [recorded]);
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
    await bustStoryLists(cache);
    redis?.disconnect();
    await pool.end();
    await app.close();
  });

  describe('GET /stories', () => {
    it('lists the published stories only, easiest and shortest first, then by title', async () => {
      const stories = await list();
      expect(stories.map((st) => st.slug)).toEqual([
        slug('short-a'),
        slug('short-b'),
        slug('sorani'),
        slug('long-l1'),
        slug('medium-l2'),
      ]);
      expect(stories[0]).toEqual({
        id: ids['short-a'],
        slug: slug('short-a'),
        title: `C ${s}`,
        summary: 'Kurteya çîrokê.',
        dialect: 'kurmanci',
        level: 1,
        length: 'short',
        wordCount: 82,
        readingMinutes: 2,
        fullyNarrated: false,
      });
      // never the questions, nor anything else of the story
      expect(JSON.stringify(stories)).not.toContain('Pirs 1');
    });

    it('filters by variety, length and level, signed in or not', async () => {
      expect((await list('?dialect=sorani')).map((st) => st.slug)).toEqual([slug('sorani')]);
      expect((await list('?dialect=kurmanci&length=short')).map((st) => st.slug)).toEqual([slug('short-a'), slug('short-b')]);
      expect((await list('?level=2')).map((st) => st.slug)).toEqual([slug('medium-l2')]);
      expect((await list('?dialect=kurmanci&length=long&level=1')).map((st) => st.slug)).toEqual([slug('long-l1')]);
      const signedIn = await get('/stories?dialect=sorani', learner);
      expect(ours(signedIn.json().stories).map((st) => st.slug)).toEqual([slug('sorani')]);
      for (const bad of ['?dialect=zazaki', '?length=tiny', '?level=4', '?level=x']) {
        expect((await get(`/stories${bad}`)).statusCode).toBe(400);
      }
    });

    it.skipIf(!process.env.REDIS_URL)('is served from the cache until a publish empties it', async () => {
      const before = await list('?dialect=kurmanci&length=short');
      // a change that does not go through the admin is invisible until the cache is emptied
      await pool.query(`UPDATE stories SET title = $2 WHERE id = $1`, [ids['short-a'], `Z ${s}`]);
      expect(await list('?dialect=kurmanci&length=short')).toEqual(before);
      // another filter is another entry, asked for the first time
      expect((await list('?dialect=kurmanci&length=short&level=1')).map((st) => st.title)).toEqual([`D ${s}`, `Z ${s}`]);

      const id = await story('short-new', { title: `F ${s}` });
      expect((await list('?dialect=kurmanci&length=short')).map((st) => st.id)).toEqual([ids['short-b'], id, ids['short-a']]);
    });
  });

  describe('GET /stories/:idOrSlug', () => {
    it('gives one published story to read, by slug or by id, with its paragraphs and glossary', async () => {
      const bySlug = await get(`/stories/${slug('short-b')}`);
      expect(bySlug.statusCode, bySlug.body).toBe(200);
      const story = bySlug.json();
      expect(story).toMatchObject({
        id: ids['short-b'],
        slug: slug('short-b'),
        dialect: 'kurmanci',
        length: 'short',
        glossary: [{ term: 'cotkar', meanings: { en: 'farmer' } }],
        audio: {},
        fullyNarrated: false,
      });
      expect(story.paragraphs).toHaveLength(3);
      expect(story.paragraphs[0]).toMatch(/^Rojîn deh salî ye\./);
      expect(story).not.toHaveProperty('questions');
      expect(story).not.toHaveProperty('body');

      const byId = await get(`/stories/${ids['short-b']}`, learner);
      expect(byId.json()).toEqual(story);
    });

    it('is 404 for anything not published, and for what cannot be a slug', async () => {
      for (const name of ['draft', 'review', 'archived']) {
        expect((await get(`/stories/${slug(name)}`)).statusCode).toBe(404);
        expect((await get(`/stories/${ids[name]}`)).statusCode).toBe(404);
      }
      expect((await get('/stories/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404);
      expect((await get('/stories/no-such-story')).statusCode).toBe(404);
      // not a uuid and not a slug: a miss, never a database error
      expect((await get('/stories/Not_A_Slug')).statusCode).toBe(404);
      expect((await get(`/stories/${'a'.repeat(81)}`)).statusCode).toBe(400);
    });

    it('attaches the recordings it has, and is fully narrated when every sentence has one', async () => {
      const sorani = (await get(`/stories/${slug('sorani')}`)).json();
      const sentence = 'ژیان لە گوندێکی بچووک دەژی.';
      const key = lessonAudioKey(sentence);
      recorded.push(key);
      await pool.query(
        `INSERT INTO lesson_audio (key, text, media_key, url, content_type, duration_ms)
         VALUES ($1, $2, 'm', 'https://cdn.test/ziyan.wav', 'audio/wav', 1200) ON CONFLICT (key) DO NOTHING`,
        [key, sentence],
      );
      expect(sorani.fullyNarrated).toBe(false);
      const after = (await get(`/stories/${slug('sorani')}`)).json();
      expect(after.audio).toEqual({ [key]: 'https://cdn.test/ziyan.wav' });
      expect(after.fullyNarrated).toBe(true);

      // one recording out of ten sentences: some audio, not fully narrated
      const first = 'Rojîn deh salî ye.';
      recorded.push(lessonAudioKey(first));
      await pool.query(
        `INSERT INTO lesson_audio (key, text, media_key, url, content_type, duration_ms)
         VALUES ($1, $2, 'm', 'https://cdn.test/rojin.wav', 'audio/wav', 1200) ON CONFLICT (key) DO NOTHING`,
        [lessonAudioKey(first), first],
      );
      const kurmanci = (await get(`/stories/${slug('long-l1')}`)).json();
      expect(kurmanci.audio).toEqual({ [lessonAudioKey(first)]: 'https://cdn.test/rojin.wav' });
      expect(kurmanci.fullyNarrated).toBe(false);

      // the list says the same once its cache is emptied (a studio save does that)
      await bustStoryLists(cache);
      const listed = await list();
      expect(listed.find((st) => st.id === ids.sorani)!.fullyNarrated).toBe(true);
      expect(listed.find((st) => st.id === ids['long-l1'])!.fullyNarrated).toBe(false);

      // and a game's copy of a text looks its audio up the same way
      const service = new StoriesService(pool);
      expect(await service.audioFor(sorani.paragraphs)).toEqual({ audio: { [key]: 'https://cdn.test/ziyan.wav' }, fullyNarrated: true });
      expect(await service.audioFor(['* * *'])).toEqual({ audio: {}, fullyNarrated: false });
    });
  });

  describe('for the story games', () => {
    it('gives a published story with its whole bank, and nothing else', async () => {
      const service = new StoriesService(pool);
      const story = await service.getPublishedForGame(ids['short-b']!);
      expect(story).toMatchObject({
        id: ids['short-b'],
        slug: slug('short-b'),
        title: `D ${s}`,
        summary: 'Kurteya çîrokê.',
        dialect: 'kurmanci',
        level: 1,
        length: 'short',
        wordCount: 82,
        glossary: [{ term: 'cotkar', meanings: { en: 'farmer' } }],
      });
      expect(story!.body).toBe(testStory('x').body);
      expect(story!.questions).toHaveLength(6);
      expect(story!.questions[1]).toEqual({
        id: expect.any(String),
        position: 1,
        kind: 'vocabulary',
        prompt: 'Pirs 2?',
        promptEn: 'Question 2?',
        options: ['Yek 1', 'Du 1', 'Sê 1'],
        correctIndex: 1,
        explanation: 'Çîrok wiha dibêje.',
        explanationEn: 'The story says so.',
        evidenceParagraph: 0,
        evidenceSentence: 0,
      });
      for (const name of ['draft', 'review', 'archived']) expect(await service.getPublishedForGame(ids[name]!)).toBeNull();
      expect(await service.getPublishedForGame('00000000-0000-4000-8000-000000000000')).toBeNull();
      expect(await service.getPublishedForGame('not-a-uuid')).toBeNull();
    });

    it('holds an unpublish back while a game is starting on the story', async () => {
      const id = await story('starting');
      const { lockVersion } = (await admin.get(id))!;
      const service = new StoriesService(pool);
      const game = await pool.connect();
      try {
        await game.query('BEGIN');
        expect(await service.getPublishedForGame(id, game)).not.toBeNull();
        let done = false;
        const unpublish = admin.transition(id, 'unpublish', { adminId: editorId, lockVersion }).then((r) => {
          done = true;
          return r;
        });
        await new Promise((r) => setTimeout(r, 300));
        expect(done).toBe(false);
        await game.query('COMMIT');
        expect((await unpublish).status).toBe('draft');
      } finally {
        game.release();
      }
      expect(await service.getPublishedForGame(id)).toBeNull();
    });

    it('picks a random published story of a variety and length, preferring one the player has not finished', async () => {
      // two level-3 short Kurmancî stories, a combination nothing else here uses
      const done = await story('pick-done', { level: 3 });
      const fresh = await story('pick-fresh', { level: 3 });
      await story('pick-draft', { level: 3 }, false);
      const service = new StoriesService(pool);

      const seen = new Set<string>();
      for (let i = 0; i < 30; i++) {
        const picked = await service.pickRandomPublished({ dialect: 'kurmanci', length: 'short', level: 3 });
        seen.add(picked!.id);
        expect(picked!.questions).toHaveLength(6);
      }
      expect([...seen].sort()).toEqual([done, fresh].sort());
      expect(await service.pickRandomPublished({ dialect: 'sorani', length: 'long' })).toBeNull();
      expect(await service.pickRandomPublished({ dialect: 'sorani', length: 'short', level: 3 })).toBeNull();

      // the games' completions table: the test brings a stand-in when the games' migration has not run
      const existed = (await pool.query(`SELECT to_regclass('public.story_completions') IS NOT NULL AS ok`)).rows[0].ok;
      if (!existed) {
        await pool.query(
          `CREATE TABLE story_completions (user_id uuid NOT NULL, story_id uuid NOT NULL,
             first_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, story_id))`,
        );
      }
      try {
        await pool.query(`INSERT INTO story_completions (user_id, story_id) VALUES ($1, $2)`, [userIds[1], done]);
        const preferring = new StoriesService(pool);
        for (let i = 0; i < 15; i++) {
          const picked = await preferring.pickRandomPublished({
            dialect: 'kurmanci',
            length: 'short',
            level: 3,
            preferNotCompletedBy: userIds[1],
          });
          expect(picked!.id).toBe(fresh);
        }
        // a rematch names every player: a story any of them finished comes last (and a non-uuid is no player)
        for (const players of [[userIds[0]!, userIds[1]!], ['not-a-uuid', userIds[1]!]]) {
          for (let i = 0; i < 10; i++) {
            const picked = await preferring.pickRandomPublished({ dialect: 'kurmanci', length: 'short', level: 3, preferNotCompletedBy: players });
            expect(picked!.id).toBe(fresh);
          }
        }
        expect(
          (await preferring.pickRandomPublished({ dialect: 'kurmanci', length: 'short', level: 3, preferNotCompletedBy: [userIds[0]!] }))!.summary,
        ).toBe('Kurteya çîrokê.');
        // finished everything: still a story, not none
        await pool.query(`INSERT INTO story_completions (user_id, story_id) VALUES ($1, $2)`, [userIds[1], fresh]);
        const again = await preferring.pickRandomPublished({ dialect: 'kurmanci', length: 'short', level: 3, preferNotCompletedBy: userIds[1] });
        expect([done, fresh]).toContain(again!.id);
        await pool.query(`INSERT INTO story_completions (user_id, story_id) VALUES ($1, $2)`, [userIds[0], fresh]);
        await pool.query(`DELETE FROM story_completions WHERE user_id = $1 AND story_id = $2`, [userIds[1], fresh]);
        const between = await preferring.pickRandomPublished({
          dialect: 'kurmanci',
          length: 'short',
          level: 3,
          preferNotCompletedBy: [userIds[0]!, userIds[1]!],
        });
        expect([done, fresh]).toContain(between!.id);
      } finally {
        await pool.query(`DELETE FROM story_completions WHERE user_id = ANY($1)`, [userIds]);
        if (!existed) await pool.query(`DROP TABLE story_completions`);
      }
    });
  });
});
