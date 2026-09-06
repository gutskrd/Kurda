/** Likes and bookmarks across post types, against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { EngagementService } from './engagement-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('post engagement (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let engagement: EngagementService;
  const suffix = Date.now().toString(36);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};
  let storyId = '';
  let pictureId = '';

  async function register(tag: string, ip: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `eng_${tag}_${suffix}@it.kurda.app`,
        username: `eng_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    ids[tag] = res.json().user.id;
    tokens[tag] = res.json().tokens.accessToken;
  }

  const call = (method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as object, remoteAddress: '10.91.2.2' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    engagement = new EngagementService(pool);
    await register('me', '10.91.0.1');
    await register('mate', '10.91.0.2');

    storyId = (
      await pool.query<{ id: string }>(
        `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at)
         VALUES ($1, 'user', 'story', $2, 'Some words.', 'kmr', 'published', now()) RETURNING id`,
        [ids.mate!, `Story ${suffix}`],
      )
    ).rows[0]!.id;

    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status)
       VALUES ($1, 'image/webp', 1024, now(), 'cleared') ON CONFLICT (key) DO NOTHING`,
      [`eng/${suffix}.webp`],
    );
    pictureId = (
      await pool.query<{ id: string }>(
        `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, category)
         VALUES ($1, 'user', $2, 'A picture', 'image') RETURNING id`,
        [ids.mate!, `eng/${suffix}.webp`],
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
    await pool.query(`DELETE FROM media_uploads WHERE key = $1`, [`eng/${suffix}.webp`]);
    await pool.end();
    await app.close();
  });

  it('likes a story and takes it back on a second press', async () => {
    const on = await call('POST', `/posts/library/${storyId}/like`, tokens.me!);
    expect(on.statusCode).toBe(200);
    expect(on.json()).toMatchObject({ on: true, engagement: { likes: 1, liked: true } });

    const off = await call('POST', `/posts/library/${storyId}/like`, tokens.me!);
    // the same button, so the server decides which way it goes — a client that
    // thinks it knows the state can be a tab behind
    expect(off.json()).toMatchObject({ on: false, engagement: { likes: 0, liked: false } });
  });

  it('counts other people without claiming their like as yours', async () => {
    await call('POST', `/posts/library/${storyId}/like`, tokens.mate!);
    const mine = await call('POST', `/posts/library/${storyId}/like`, tokens.me!);
    expect(mine.json().engagement).toMatchObject({ likes: 2, liked: true });

    const counts = await engagement.forPosts(ids.me!, 'library', [storyId]);
    expect(counts.get(storyId)).toMatchObject({ likes: 2, liked: true });
    // a viewer who has not liked it sees the same total and a cold heart
    const stranger = await engagement.forPosts(null, 'library', [storyId]);
    expect(stranger.get(storyId)).toMatchObject({ likes: 2, liked: false });
  });

  it('keeps a like and a bookmark apart on the same post', async () => {
    const saved = await call('POST', `/posts/library/${storyId}/bookmark`, tokens.me!);
    expect(saved.json().engagement).toMatchObject({ bookmarks: 1, bookmarked: true, liked: true });
    // un-saving must not un-like
    await call('POST', `/posts/library/${storyId}/bookmark`, tokens.me!);
    const after = await engagement.forPosts(ids.me!, 'library', [storyId]);
    expect(after.get(storyId)).toMatchObject({ bookmarked: false, liked: true });
  });

  it('works the same on a picture as on a story', async () => {
    const res = await call('POST', `/posts/image/${pictureId}/like`, tokens.me!);
    expect(res.json().engagement).toMatchObject({ likes: 1, liked: true });
    // and the two kinds of post do not share a counter
    const story = await engagement.forPosts(ids.me!, 'library', [storyId]);
    expect(story.get(storyId)!.likes).toBe(2);
  });

  it('answers for a whole page in one query', async () => {
    const counts = await engagement.forPosts(ids.me!, 'library', [storyId, storyId, crypto.randomUUID()]);
    // every id asked about comes back, including ones nobody has touched
    expect(counts.size).toBe(2);
    expect([...counts.values()].some((e) => e.likes === 0)).toBe(true);
  });

  it('refuses a post type it does not know', async () => {
    const res = await call('POST', `/posts/nonsense/${storyId}/like`, tokens.me!);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BAD_TARGET');

    const kind = await call('POST', `/posts/library/${storyId}/shout`, tokens.me!);
    expect(kind.json().code).toBe('BAD_KIND');
  });

  it('is a signed-in action', async () => {
    const res = await app.inject({ method: 'POST', url: `/posts/library/${storyId}/like`, remoteAddress: '10.91.2.2' });
    expect(res.statusCode).toBe(401);
  });

  it('shows what you liked on your profile, mixing stories and pictures', async () => {
    await call('POST', `/posts/library/${storyId}/bookmark`, tokens.me!);

    const likes = await call('GET', `/users/${ids.me}/activity?kind=likes`, tokens.mate!);
    expect(likes.statusCode).toBe(200);
    const kinds = likes.json().entries.map((e: { kind: string }) => e.kind);
    // a liked picture keeps its own kind, so the tab can render it as a picture
    expect(kinds).toContain('images');
    expect(kinds).toContain('stories');

    const saved = await call('GET', `/users/${ids.me}/activity?kind=bookmarks`, tokens.mate!);
    expect(saved.json().entries).toHaveLength(1);
  });

  it('lets you hide what you have liked without unliking it', async () => {
    expect((await call('PATCH', '/me/profile/sections', tokens.me!, { likes: false })).statusCode).toBe(200);

    const hidden = await call('GET', `/users/${ids.me}/activity?kind=likes`, tokens.mate!);
    expect(hidden.json().entries).toEqual([]);
    // still yours, still counted on the post
    const counts = await engagement.forPosts(ids.me!, 'library', [storyId]);
    expect(counts.get(storyId)!.liked).toBe(true);

    // and you can still see your own
    const own = await call('GET', `/users/${ids.me}/activity?kind=likes`, tokens.me!);
    expect(own.json().entries.length).toBeGreaterThan(0);

    await call('PATCH', '/me/profile/sections', tokens.me!, { likes: true });
  });

  it('drops a removed post out of your liked list rather than leaving a hole', async () => {
    const doomed = (
      await pool.query<{ id: string }>(
        `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at)
         VALUES ($1, 'user', 'poem', $2, 'Short.', 'kmr', 'published', now()) RETURNING id`,
        [ids.mate!, `Doomed ${suffix}`],
      )
    ).rows[0]!.id;
    await call('POST', `/posts/library/${doomed}/like`, tokens.me!);
    expect((await call('GET', `/users/${ids.me}/activity?kind=likes`, tokens.me!)).json().entries.map((e: { title: string }) => e.title)).toContain(`Doomed ${suffix}`);

    await pool.query(`UPDATE library_posts SET status = 'removed' WHERE id = $1`, [doomed]);
    const after = await call('GET', `/users/${ids.me}/activity?kind=likes`, tokens.me!);
    expect(after.json().entries.map((e: { title: string }) => e.title)).not.toContain(`Doomed ${suffix}`);
  });
});
