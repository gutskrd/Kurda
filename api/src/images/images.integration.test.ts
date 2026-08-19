/** Community image & meme sharing via HTTP (CI integration job). KUR-290. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('image posts (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];
  let authorTok: string, otherTok: string, founderTok: string;

  async function register(tag: string, ip: string): Promise<{ token: string; id: string }> {
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: `img_${tag}_${suffix}@it.kurda.app`, username: `img_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: ip,
    });
    userIds.push(res.json().user.id);
    return { token: res.json().tokens.accessToken, id: res.json().user.id };
  }
  const call = (method: 'POST' | 'GET' | 'PATCH' | 'DELETE', url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.60.0.9' });

  // A post can only reference media that cleared the upload pipeline (#294), so
  // seed a confirmed+cleared row for the keys these model tests use.
  const seedMedia = (key: string, scanStatus = 'cleared') =>
    pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status)
       VALUES ($1, 'image/webp', 1024, now(), $2)
       ON CONFLICT (key) DO UPDATE SET confirmed_at = now(), scan_status = EXCLUDED.scan_status`,
      [key, scanStatus],
    );

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    authorTok = (await register('author', '10.60.0.1')).token;
    otherTok = (await register('other', '10.60.0.2')).token;
    const founder = await register('founder', '10.60.0.3');
    await pool.query(`UPDATE users SET roles = '{founder}' WHERE id = $1`, [founder.id]);
    founderTok = await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: `img_founder_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
      remoteAddress: '10.60.0.3',
    }).then((r) => r.json().tokens.accessToken);
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('users & founder upload (image required, caption optional); guests blocked; image required', async () => {
    expect((await call('POST', '/images', undefined, { imageMediaId: 'm/x.jpg' })).statusCode).toBe(401);
    expect((await call('POST', '/images', authorTok, { caption: 'no image' })).statusCode).toBe(400); // schema: imageMediaId required

    await seedMedia('media/meme.gif');
    const meme = await call('POST', '/images', authorTok, { imageMediaId: 'media/meme.gif', caption: 'kurdî meme' });
    expect(meme.statusCode).toBe(201);
    expect(meme.json().category).toBe('meme'); // default
    expect(meme.json().authorRole).toBe('user');
    expect(meme.json()).toHaveProperty('imageUrl'); // resolved CDN URL (null when storage unset)

    await seedMedia('media/f.png');
    const founderPost = await call('POST', '/images', founderTok, { imageMediaId: 'media/f.png', category: 'image' });
    expect(founderPost.statusCode).toBe(201);
    expect(founderPost.json().authorRole).toBe('founder');
    expect(founderPost.json().caption).toBeNull();
  });

  it('rejects a post whose media never cleared the upload pipeline', async () => {
    // unknown key
    expect((await call('POST', '/images', authorTok, { imageMediaId: 'media/never-uploaded.webp' })).statusCode).toBe(422);
    // known but blocked by moderation
    await seedMedia('media/blocked.webp', 'blocked');
    expect((await call('POST', '/images', authorTok, { imageMediaId: 'media/blocked.webp' })).statusCode).toBe(422);
  });

  it('browse is public, filters by category, and read increments views', async () => {
    await seedMedia('media/m2.jpg');
    await call('POST', '/images', authorTok, { imageMediaId: 'media/m2.jpg', category: 'meme' });
    const list = await call('GET', '/images?category=meme');
    expect(list.statusCode).toBe(200);
    expect(list.json().posts.every((p: { category: string }) => p.category === 'meme')).toBe(true);

    const id = list.json().posts[0].id;
    const before = list.json().posts[0].viewCount;
    const read = await call('GET', `/images/${id}`);
    expect(read.json().viewCount).toBe(before + 1);
  });

  it('author or admin edits caption / removes; others cannot; removed hidden but retained', async () => {
    await seedMedia('media/edit.jpg');
    const post = (await call('POST', '/images', authorTok, { imageMediaId: 'media/edit.jpg', caption: 'v1' })).json();

    expect((await call('PATCH', `/images/${post.id}`, otherTok, { caption: 'hijack' })).statusCode).toBe(403);
    const edit = await call('PATCH', `/images/${post.id}`, authorTok, { caption: 'v2' });
    expect(edit.json().caption).toBe('v2');

    expect((await call('DELETE', `/images/${post.id}`, otherTok)).statusCode).toBe(403);
    expect((await call('DELETE', `/images/${post.id}`, authorTok)).statusCode).toBe(200);
    expect((await call('GET', `/images/${post.id}`)).statusCode).toBe(404); // hidden
    const row = await pool.query<{ status: string }>(`SELECT status FROM image_posts WHERE id = $1`, [post.id]);
    expect(row.rows[0]!.status).toBe('removed'); // retained
  });
});
