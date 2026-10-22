/** The wall in four orders, and the time ranges the ranked two look back over, against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('community feed order (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const ids: Record<string, string> = {};
  /** the four posts, by the letter the tests read them as */
  const made: Record<string, string> = {};

  async function register(tag: string, ip: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `fsort_${tag}_${suffix}@it.kurda.app`,
        username: `fsort_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    ids[tag] = res.json().user.id;
  }

  async function library(type: 'gotin' | 'story' | 'poem', hoursAgo: number, comments: number): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at, created_at)
       VALUES ($1, 'user', $2, $3, 'Peyvên xweş ji bo xwendinê.', 'kmr', 'published',
               now() - ($4 || ' hours')::interval, now() - ($4 || ' hours')::interval)
       RETURNING id`,
      [ids.author!, type, type === 'gotin' ? null : `${type} ${suffix}`, String(hoursAgo)],
    );
    const id = res.rows[0]!.id;
    await pool.query('UPDATE library_posts SET comment_count = $2 WHERE id = $1', [id, comments]);
    return id;
  }

  async function engage(who: string, type: 'library' | 'image', id: string, kind: 'like' | 'repost' | 'bookmark'): Promise<void> {
    await pool.query('INSERT INTO post_engagements (user_id, target_type, target_id, kind) VALUES ($1, $2, $3, $4)', [ids[who]!, type, id, kind]);
  }

  /** This test's own posts, in the order the wall gave them, as letters. */
  async function order(query: string): Promise<string[]> {
    const res = await app.inject({ method: 'GET', url: `/feed?limit=50&${query}`, remoteAddress: '10.94.1.1' });
    expect(res.statusCode).toBe(200);
    const letter = new Map(Object.entries(made).map(([k, v]) => [v, k]));
    return (res.json().items as Array<{ id: string }>).map((i) => letter.get(i.id)).filter((l): l is string => l !== undefined);
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await register('author', '10.94.0.1');
    for (const [i, r] of ['r1', 'r2', 'r3'].entries()) await register(r, `10.94.0.${i + 2}`);

    // A: a story from three days ago, one heart
    made.A = await library('story', 72, 0);
    await engage('r1', 'library', made.A, 'like');
    // B: a poem from forty days ago, three hearts and a repost — and a bookmark, which is nobody's business and counts for nothing
    made.B = await library('poem', 40 * 24, 0);
    for (const r of ['r1', 'r2', 'r3']) await engage(r, 'library', made.B, 'like');
    await engage('r1', 'library', made.B, 'repost');
    await engage('r2', 'library', made.B, 'bookmark');
    // D: a saying from more than a year ago, two hearts and a comment
    made.D = await library('gotin', 400 * 24, 1);
    for (const r of ['r1', 'r2']) await engage(r, 'library', made.D, 'like');

    // C: a picture from two hours ago, no hearts but five comments
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status)
       VALUES ($1, 'image/webp', 1024, now(), 'cleared') ON CONFLICT (key) DO NOTHING`,
      [`fsort/${suffix}.webp`],
    );
    made.C = (
      await pool.query<{ id: string }>(
        `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, category, created_at, comment_count)
         VALUES ($1, 'user', $2, 'Êvar', 'image', now() - interval '2 hours', 5) RETURNING id`,
        [ids.author!, `fsort/${suffix}.webp`],
      )
    ).rows[0]!.id;
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM media_uploads WHERE key = $1`, [`fsort/${suffix}.webp`]);
    await pool.end();
    await app.close();
  });

  it('opens newest first, as it always has', async () => {
    expect(await order('')).toEqual(['C', 'A', 'B', 'D']);
    expect(await order('sort=newest')).toEqual(['C', 'A', 'B', 'D']);
  });

  it('reads from the beginning when asked for the oldest', async () => {
    expect(await order('sort=oldest')).toEqual(['D', 'B', 'A', 'C']);
  });

  it('ranks by hearts, reposts and comments together for the most popular', async () => {
    // C 5 comments, B 3 hearts and a repost, D 2 hearts and a comment, A 1 heart
    expect(await order('sort=popular')).toEqual(['C', 'B', 'D', 'A']);
  });

  it('looks back only as far as the range asked for', async () => {
    expect(await order('sort=popular&period=day')).toEqual(['C']);
    expect(await order('sort=popular&period=week')).toEqual(['C', 'A']);
    expect(await order('sort=popular&period=month')).toEqual(['C', 'A']);
    expect(await order('sort=popular&period=year')).toEqual(['C', 'B', 'A']);
    expect(await order('sort=popular&period=all')).toEqual(['C', 'B', 'D', 'A']);
  });

  it('ranks by comments alone for the most discussed, newest first among equals', async () => {
    expect(await order('sort=discussed')).toEqual(['C', 'D', 'A', 'B']);
    expect(await order('sort=discussed&period=week')).toEqual(['C', 'A']);
  });

  it('keeps a range to the ranked orders: the newest and the oldest read everything', async () => {
    expect(await order('sort=newest&period=day')).toEqual(['C', 'A', 'B', 'D']);
    expect(await order('sort=oldest&period=week')).toEqual(['D', 'B', 'A', 'C']);
  });

  it('sorts within a half and a kind as well as across the whole wall', async () => {
    expect(await order('section=gotin&sort=popular')).toEqual(['B', 'D', 'A']);
    expect(await order('section=gotin&kind=helbest&sort=oldest')).toEqual(['B']);
    expect(await order('section=dimen&sort=popular&period=day')).toEqual(['C']);
  });

  it('pages a ranked wall without repeating or dropping a post', async () => {
    const first = await app.inject({ method: 'GET', url: '/feed?sort=popular&limit=2&offset=0', remoteAddress: '10.94.1.1' });
    const second = await app.inject({ method: 'GET', url: '/feed?sort=popular&limit=2&offset=2', remoteAddress: '10.94.1.1' });
    const keys = [...first.json().items, ...second.json().items].map((i: { id: string }) => i.id);
    expect(new Set(keys).size).toBe(keys.length);
    const ours = keys.filter((k) => Object.values(made).includes(k));
    expect(ours).toEqual([made.C, made.B, made.D, made.A].slice(0, ours.length));
  });

  it('refuses an order or a range it does not know', async () => {
    for (const q of ['sort=random', 'sort=popular&period=decade']) {
      const res = await app.inject({ method: 'GET', url: `/feed?${q}`, remoteAddress: '10.94.1.1' });
      expect(res.statusCode).toBe(400);
    }
  });
});
