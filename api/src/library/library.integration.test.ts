/** Community library authoring + browsing via HTTP (CI integration job). KUR-281. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('community library (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];
  let authorTok: string, otherTok: string, adminTok: string, adminId: string;

  async function register(tag: string, ip: string): Promise<{ token: string; id: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `lib_${tag}_${suffix}@it.kurda.app`, username: `lib_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: ip,
    });
    const id = res.json().user.id;
    userIds.push(id);
    return { token: res.json().tokens.accessToken, id };
  }

  const post = (method: 'POST' | 'GET' | 'PATCH' | 'DELETE', url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.30.0.9' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    authorTok = (await register('author', '10.30.0.1')).token;
    otherTok = (await register('other', '10.30.0.2')).token;
    const admin = await register('admin', '10.30.0.3');
    adminId = admin.id;
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [adminId]);
    adminTok = (await app.inject({
      method: 'POST', url: '/auth/login',
      payload: { email: `lib_admin_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
      remoteAddress: '10.30.0.3',
    }).then((r) => r.json().tokens.accessToken)); // fresh token carries the admin role
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('guests cannot author; a signed-in user can (text-only)', async () => {
    expect((await post('POST', '/library/posts', undefined, { type: 'poem', title: 'x', body: 'y' })).statusCode).toBe(401);

    const res = await post('POST', '/library/posts', authorTok, { type: 'poem', title: 'Keçikê', body: 'Rojek li Amedê\nbaran dibare' });
    expect(res.statusCode).toBe(201);
    expect(res.json().type).toBe('poem');
    expect(res.json().authorRole).toBe('user');
    expect(res.json().audioMediaId).toBeNull();
    expect(res.json().body).toContain('\n'); // line breaks preserved
  });

  it('admin can author with text + audio; empty body is rejected', async () => {
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status)
       VALUES ('media/audio/x.mp3','audio/mpeg',2048,now(),'cleared') ON CONFLICT (key) DO UPDATE SET confirmed_at = now()`,
    );
    const res = await post('POST', '/library/posts', adminTok, { type: 'story', title: 'Çîrok', body: 'Demek dûr...', audioMediaId: 'media/audio/x.mp3' });
    expect(res.statusCode).toBe(201);
    expect(res.json().authorRole).toBe('admin');
    expect(res.json().audioMediaId).toBe('media/audio/x.mp3');
    expect(res.json()).toHaveProperty('audioUrl'); // resolved CDN URL (null when storage unset)

    expect((await post('POST', '/library/posts', adminTok, { type: 'story', title: 'ok', body: '   ' })).statusCode).toBe(422);
  });

  it('browse is public, filters by type, and read increments views', async () => {
    const list = await post('GET', '/library/posts?type=poem');
    expect(list.statusCode).toBe(200);
    const poem = list.json().posts.find((p: { title: string }) => p.title === 'Keçikê');
    expect(poem).toBeTruthy();
    expect(list.json().posts.every((p: { type: string }) => p.type === 'poem')).toBe(true);

    const before = poem.viewCount;
    const read = await post('GET', `/library/posts/${poem.id}`);
    expect(read.statusCode).toBe(200);
    expect(read.json().viewCount).toBe(before + 1);
  });

  it('only the author or an admin can edit / remove', async () => {
    const created = (await post('POST', '/library/posts', authorTok, { type: 'story', title: 'Mine', body: 'body here' })).json();

    expect((await post('PATCH', `/library/posts/${created.id}`, otherTok, { title: 'hijack' })).statusCode).toBe(403);

    const edit = await post('PATCH', `/library/posts/${created.id}`, authorTok, { title: 'Mine (edited)' });
    expect(edit.statusCode).toBe(200);
    expect(edit.json().title).toBe('Mine (edited)');

    // admin can also edit someone else's
    expect((await post('PATCH', `/library/posts/${created.id}`, adminTok, { language: 'ckb' })).statusCode).toBe(200);

    // unpublish hides from browse; remove makes it unreadable
    expect((await post('POST', `/library/posts/${created.id}/unpublish`, authorTok)).statusCode).toBe(200);
    const afterUnpub = await post('GET', '/library/posts');
    expect(afterUnpub.json().posts.some((p: { id: string }) => p.id === created.id)).toBe(false);

    expect((await post('POST', `/library/posts/${created.id}/publish`, authorTok)).statusCode).toBe(200);
    expect((await post('DELETE', `/library/posts/${created.id}`, adminTok)).statusCode).toBe(200);
    expect((await post('GET', `/library/posts/${created.id}`)).statusCode).toBe(404);
  });
});
