/**
 * Paging the wall in time order: each table's half is cut at the page's end, so every page must still be the same
 * slice of the whole wall. Read in one rolled-back snapshot, so posts other tests make cannot move the pages.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { FeedService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('community feed pages (integration)', () => {
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let feed: FeedService;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    client = await pool.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    feed = new FeedService({ query: (sql: string, params?: unknown[]) => client.query(sql, params) } as unknown as pg.Pool);
    const author = await client.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ('fpage_' || $1 || '@it.kurda.app', 'fpage_' || $1) RETURNING id`,
      [suffix],
    );
    // Written posts and pictures interleaved in time, some at the very same moment, so ties fall to the id.
    await client.query(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, status, published_at, created_at)
       SELECT $1, 'user', 'poem', 'Helbest', 'Peyvên xweş.', 'published', now() - (g / 2) * interval '1 hour', now() - interval '900 days'
         FROM generate_series(1, 9) g`,
      [author.rows[0]!.id],
    );
    await client.query(
      `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, created_at)
       SELECT $1, 'user', 'fpage/' || g, 'Wêne', now() - (g / 3) * interval '1 hour' FROM generate_series(1, 9) g`,
      [author.rows[0]!.id],
    );
  });

  afterAll(async () => {
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  });

  for (const sort of ['newest', 'oldest'] as const) {
    it(`gives the same posts page by page as in one read, ${sort} first`, async () => {
      const whole = (await feed.list(null, { sort, limit: 50 }))!.map((i) => i.key);
      const paged: string[] = [];
      for (let offset = 0; offset < 30; offset += 3) paged.push(...(await feed.list(null, { sort, limit: 3, offset }))!.map((i) => i.key));
      expect(paged).toEqual(whole.slice(0, 30));
      // both tables take part, in time order
      const items = (await feed.list(null, { sort, limit: 50 }))!;
      const times = items.map((i) => new Date(i.at).getTime());
      expect(times).toEqual([...times].sort((a, b) => (sort === 'newest' ? b - a : a - b)));
    });
  }
});
