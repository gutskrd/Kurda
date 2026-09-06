/** The community wall: two tables, one ordering, against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('community feed (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  const made: Record<string, string> = {};

  async function register(tag: string, ip: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `feed_${tag}_${suffix}@it.kurda.app`,
        username: `feed_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    ids[tag] = res.json().user.id;
    tokens[tag] = res.json().tokens.accessToken;
  }

  /** The card shape, as the wall actually sends it. */
  interface Item {
    key: string;
    id: string;
    kind: string;
    title: string | null;
    excerpt: string | null;
    imageUrl: string | null;
    href: string;
    author: { username: string };
    engagement: { likes: number; liked: boolean };
  }

  /** Only this test's own posts — the shared database has others in it. */
  const mine = (body: { items: Item[] }): Item[] =>
    body.items.filter((i) => Object.values(made).some((id) => i.key.endsWith(id)));

  const get = (url: string, token?: string) =>
    app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.93.1.1' });

  async function library(type: 'story' | 'poem', title: string, minutesAgo: number): Promise<string> {
    const res = await pool.query<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at)
       VALUES ($1, 'user', $2, $3, 'Peyvên xweş ji bo xwendinê.', 'kmr', 'published', now() - ($4 || ' minutes')::interval)
       RETURNING id`,
      [ids.author!, type, title, String(minutesAgo)],
    );
    return res.rows[0]!.id;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await register('author', '10.93.0.1');
    await register('reader', '10.93.0.2');

    made.story = await library('story', `Story ${suffix}`, 30);
    made.poem = await library('poem', `Poem ${suffix}`, 10);

    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status)
       VALUES ($1, 'image/webp', 1024, now(), 'cleared') ON CONFLICT (key) DO NOTHING`,
      [`feed/${suffix}.webp`],
    );
    made.picture = (
      await pool.query<{ id: string }>(
        `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, category, created_at)
         VALUES ($1, 'user', $2, $3, 'image', now() - interval '20 minutes') RETURNING id`,
        [ids.author!, `feed/${suffix}.webp`, `Picture ${suffix}`],
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
    await pool.query(`DELETE FROM media_uploads WHERE key = $1`, [`feed/${suffix}.webp`]);
    await pool.end();
    await app.close();
  });

  it('puts stories, poems and pictures on one wall, newest first', async () => {
    const res = await get('/feed?limit=50');
    expect(res.statusCode).toBe(200);
    const items = mine(res.json());

    // the point of merging: a poem posted this morning is not invisible to
    // someone who happened to be browsing pictures
    expect(items.map((i) => i.kind)).toEqual(['poem', 'image', 'story']);
  });

  it('says who wrote each one', async () => {
    const items = mine((await get('/feed?limit=50')).json());
    for (const item of items) {
      expect(item.author.username).toBe(`feed_author_${suffix}`.slice(0, 30));
    }
  });

  it('filters to one kind without changing the shape of a card', async () => {
    const poems = mine((await get('/feed?kind=poems&limit=50')).json());
    expect(poems).toHaveLength(1);
    expect(poems[0]!.kind).toBe('poem');
    expect(poems[0]!.title).toBe(`Poem ${suffix}`);

    const pictures = mine((await get('/feed?kind=images&limit=50')).json());
    expect(pictures).toHaveLength(1);
    // a picture has no title; its caption carries the words
    expect(pictures[0]).toHaveProperty('imageUrl');
  });

  it('sends a card to the right page for its kind', async () => {
    const items = mine((await get('/feed?limit=50')).json());
    const picture = items.find((i) => i.kind === 'image')!;
    const poem = items.find((i) => i.kind === 'poem')!;
    expect(picture.href).toBe(`/app/dimen/${picture.id}`);
    expect(poem.href).toBe(`/app/library/${poem.id}`);
  });

  it('trims a long body to a card and leaves the rest on the page', async () => {
    const long = 'Ev hevokek dirêj e. '.repeat(60);
    const id = (
      await pool.query<{ id: string }>(
        `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at)
         VALUES ($1, 'user', 'story', $2, $3, 'kmr', 'published', now()) RETURNING id`,
        [ids.author!, `Long ${suffix}`, long],
      )
    ).rows[0]!.id;
    made.long = id;

    const item = mine((await get('/feed?limit=50')).json()).find((i) => i.id === id)!;
    expect(item.excerpt).not.toBeNull();
    expect(item.excerpt!.length).toBeLessThan(260);
    expect(item.excerpt!.endsWith('…')).toBe(true);
  });

  it('carries your own like state, and a guest gets none', async () => {
    await app.inject({
      method: 'POST',
      url: `/posts/library/${made.poem}/like`,
      headers: { authorization: `Bearer ${tokens.reader}` },
      remoteAddress: '10.93.1.1',
    });

    const asReader = mine((await get('/feed?limit=50', tokens.reader)).json()).find((i) => i.id === made.poem)!;
    expect(asReader.engagement).toMatchObject({ likes: 1, liked: true });

    // the count is public; whose like it was is not
    const asGuest = mine((await get('/feed?limit=50')).json()).find((i) => i.id === made.poem)!;
    expect(asGuest.engagement).toMatchObject({ likes: 1, liked: false });
  });

  it('pages without dropping or repeating a post across the seam', async () => {
    const page = async (q: string): Promise<Item[]> => (await get(q)).json().items as Item[];
    const all = await page('/feed?limit=50');
    const firstPage = await page('/feed?limit=2&offset=0');
    const secondPage = await page('/feed?limit=2&offset=2');

    // merging two tables in the client would need over-fetching both sides to
    // be sure of the boundary; the union orders them once
    expect(firstPage.concat(secondPage).map((i) => i.key)).toEqual(all.slice(0, 4).map((i) => i.key));
  });

  it('leaves out what is not published', async () => {
    await pool.query(`UPDATE library_posts SET status = 'removed' WHERE id = $1`, [made.story]);
    const keys = ((await get('/feed?limit=50')).json().items as Item[]).map((i) => i.key);
    expect(keys).not.toContain(`library:${made.story}`);
    await pool.query(`UPDATE library_posts SET status = 'published' WHERE id = $1`, [made.story]);
  });

  it('refuses a filter it does not have', async () => {
    const res = await get('/feed?kind=nonsense');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BAD_KIND');
  });
});
