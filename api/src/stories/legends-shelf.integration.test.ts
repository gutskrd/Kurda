/**
 * The legends' shelf against real Postgres with the real legends: all five are on the library's front page in Kurmancî
 * and Soranî, Kawa first, however many newer stories exist. On a variety's page each legend appears once, on its shelf;
 * the whole library, as older apps request it, keeps its old shape.
 *
 * The legends are seeded from legends.json as the API seeds them and removed afterwards. If already present they are
 * used as they are; if seeded once and since removed, the test skips.
 */
import { afterAll, beforeAll, describe, expect, it, type TestContext } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import type { StoryLibrary, StoryListItem } from '@kurda/shared';
import { buildApp } from '../app.js';
import { Cache } from '../cache/cache.js';
import { createRedis } from '../cache/redis.js';
import { loadConfig } from '../config/env.js';
import { testStory } from '../test/stories.js';
import { STARTER_STORY_FILES, STARTER_STORY_VERSIONS, importStories, seedStarterStories } from './import.js';
import { bustStoryLists } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const KAWA = { kurmanci: 'kmr-kawaye-hesinkar', sorani: 'ckb-kaway-asinger' } as const;
const LEGENDS = { kurmanci: STARTER_STORY_VERSIONS.map(([k]) => k), sorani: STARTER_STORY_VERSIONS.map(([, c]) => c) };
const ALL_LEGENDS = [...LEGENDS.kurmanci, ...LEGENDS.sorani];
/** More newer stories in each variety than the newest row has room for. */
const NEWER = 9;

describe.skipIf(!DATABASE_URL)('the legends’ shelf (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let cache: Cache | null = null;
  let redis: ReturnType<typeof createRedis> | null = null;
  const s = Date.now().toString(36);
  const slug = (name: string) => `shelf-${name}-${s}`;
  let editorId = '';
  /** what the database held before: the legends, nothing of them, or the marks of legends seeded once and gone since */
  let before: 'legends' | 'nothing' | 'gone' = 'nothing';
  const seedMarks = [...ALL_LEGENDS.map((sl) => `stories:starter:${sl}`), ...STARTER_STORY_VERSIONS.map(([k, c]) => `stories:versions:${k}+${c}`)];
  const warnings: unknown[] = [];

  const library = async (dialect?: 'kurmanci' | 'sorani'): Promise<StoryLibrary> => {
    const res = await app.inject({ method: 'GET', url: `/stories/library${dialect ? `?dialect=${dialect}` : ''}`, remoteAddress: '10.96.0.3' });
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  };
  const skipUnlessReady = (ctx: TestContext): void => {
    if (before === 'gone') ctx.skip();
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
    const held = await pool.query<{ slug: string }>(`SELECT slug FROM stories WHERE slug = ANY($1) AND status = 'published'`, [ALL_LEGENDS]);
    const marked = await pool.query(`SELECT 1 FROM content_seeds WHERE name = ANY($1)`, [seedMarks]);
    before = held.rowCount === ALL_LEGENDS.length ? 'legends' : held.rowCount === 0 && marked.rowCount === 0 ? 'nothing' : 'gone';
    if (before === 'gone') return;

    if (before === 'nothing') {
      const file = STARTER_STORY_FILES.find((f) => f.pathname.endsWith('/legends.json'))!;
      const log = { info: () => undefined, warn: (obj: unknown) => void warnings.push(obj) } as never;
      await seedStarterStories(pool, log, [file], cache);
    }
    // newer than every legend, and more of them in each variety than the newest row holds
    const editor = await pool.query<{ id: string }>(`INSERT INTO users (email, username, roles) VALUES ($1, $2, '{content_editor}') RETURNING id`, [
      `shelf_editor_${s}@it.kurda.app`,
      `shelf_editor_${s}`,
    ]);
    editorId = editor.rows[0]!.id;
    const newer = [
      ...Array.from({ length: NEWER }, (_, i) => testStory(slug(`k${i}`))),
      ...Array.from({ length: NEWER }, (_, i) => testStory(slug(`c${i}`), { dialect: 'sorani' })),
    ];
    const published = await importStories(pool, { stories: newer }, { publish: true, publishedBy: editorId, cache });
    expect(published.ok, JSON.stringify(published.issues)).toBe(true);
    // and the newest of all: a legend of each variety's own, written by an editor, at the hardest level so it comes last on the shelf
    const own = [
      testStory(slug('legend-k'), { category: 'legend', level: 5 }),
      testStory(slug('legend-c'), { category: 'legend', level: 5, dialect: 'sorani' }),
    ];
    expect((await importStories(pool, { stories: own }, { publish: true, publishedBy: editorId, cache })).ok).toBe(true);
    await bustStoryLists(cache);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM stories WHERE slug LIKE $1`, [`shelf-%-${s}`]);
    if (before === 'nothing') {
      // the legends this test seeded go again, with the marks that would keep the API from seeding them on a later start
      await pool.query(`DELETE FROM stories WHERE slug = ANY($1)`, [ALL_LEGENDS]);
      await pool.query(`DELETE FROM content_seeds WHERE name = ANY($1)`, [seedMarks]);
    }
    if (editorId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
        await client.query(`DELETE FROM users WHERE id = $1`, [editorId]);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    }
    await bustStoryLists(cache);
    redis?.disconnect();
    await pool.end();
    await app.close();
  });

  for (const dialect of ['kurmanci', 'sorani'] as const) {
    it(`puts every legend on the front page of the ${dialect === 'kurmanci' ? 'Kurmancî' : 'Soranî'} library, Kawa first, whatever is newer`, async (ctx) => {
      skipUnlessReady(ctx);
      expect(warnings).toEqual([]);
      const page = await library(dialect);
      const shelf = page.legends ?? [];
      const slugs = shelf.map((st) => st.slug);
      // Kawa is there, and every other legend of the variety with it
      expect(slugs).toContain(KAWA[dialect]);
      expect(slugs).toEqual(expect.arrayContaining(LEGENDS[dialect]));
      // easiest first: Kawa, the one legend at its level, leads the five
      expect(shelf.filter((st) => ALL_LEGENDS.includes(st.slug))[0]!.slug).toBe(KAWA[dialect]);
      expect(shelf.map((st) => st.level)).toEqual([...shelf.map((st) => st.level)].sort());
      // the shelf is the variety's legends and nothing else: an editor's own legend joins it, at the end
      expect(shelf.every((st) => st.dialect === dialect && st.category === 'legend')).toBe(true);
      expect(slugs.at(-1)).toBe(slug(dialect === 'kurmanci' ? 'legend-k' : 'legend-c'));
      expect(shelf.length).toBeLessThanOrEqual(8);

      // the newest row is full of the newer stories, and no legend stands on the page a second time
      expect(page.recent).toHaveLength(8);
      expect(page.recent.every((st) => st.category !== 'legend' && st.dialect === dialect)).toBe(true);
      const onPage = [...page.featured, ...shelf, ...page.recent].map((st) => st.slug);
      for (const legend of LEGENDS[dialect]) expect(onPage.filter((sl) => sl === legend), legend).toHaveLength(1);
      // the other variety's tellings are not on this page at all
      const other = dialect === 'kurmanci' ? LEGENDS.sorani : LEGENDS.kurmanci;
      expect(onPage.some((sl) => other.includes(sl))).toBe(false);
    });
  }

  it('keeps the whole library as an older app knows it: the newest of both varieties, legends among them', async (ctx) => {
    skipUnlessReady(ctx);
    const whole = await library();
    const newest = whole.recent.map((st: StoryListItem) => st.slug);
    // the two legends published last are the newest stories of all, and stand at the head of the newest row there
    expect(newest.slice(0, 2).sort()).toEqual([slug('legend-c'), slug('legend-k')].sort());
    expect(new Set(whole.recent.map((st) => st.dialect))).toEqual(new Set(['kurmanci', 'sorani']));
    // the shelf comes too, and is simply not read by an app that does not know it
    expect((whole.legends ?? []).every((st) => st.category === 'legend')).toBe(true);
  });

  it('opens a legend in either variety with the other telling to switch to', async (ctx) => {
    skipUnlessReady(ctx);
    for (const [kurmanci, sorani] of STARTER_STORY_VERSIONS) {
      const res = await app.inject({ method: 'GET', url: `/stories/${kurmanci}`, remoteAddress: '10.96.0.3' });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().versions.map((v: { slug: string; dialect: string }) => [v.slug, v.dialect])).toEqual([[sorani, 'sorani']]);
    }
  });
});
