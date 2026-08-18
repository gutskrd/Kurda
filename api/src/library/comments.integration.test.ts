/** Threaded library comments via HTTP (CI integration job). KUR-283. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('library comments (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];
  let authorTok: string, otherTok: string, postId: string;

  async function register(tag: string, ip: string): Promise<string> {
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: `cmt_${tag}_${suffix}@it.kurda.app`, username: `cmt_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: ip,
    });
    userIds.push(res.json().user.id);
    return res.json().tokens.accessToken;
  }

  const call = (method: 'POST' | 'GET' | 'PATCH' | 'DELETE', url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.40.0.9' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    authorTok = await register('author', '10.40.0.1');
    otherTok = await register('other', '10.40.0.2');
    postId = (await call('POST', '/library/posts', authorTok, { type: 'story', title: 'Post', body: 'A tale.' })).json().id;
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('lets users comment (text/audio/both) but blocks guests; empty is rejected', async () => {
    expect((await call('POST', `/library/posts/${postId}/comments`, undefined, { body: 'hi' })).statusCode).toBe(401);
    expect((await call('POST', `/library/posts/${postId}/comments`, authorTok, {})).statusCode).toBe(422);

    // a voice comment must reference a confirmed audio upload (KUR-282)
    expect((await call('POST', `/library/posts/${postId}/comments`, otherTok, { audioMediaId: 'media/unconfirmed.mp3' })).statusCode).toBe(422);
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status)
       VALUES ('media/a.mp3','audio/mpeg',2048,now(),'cleared'), ('media/b.mp3','audio/mpeg',2048,now(),'cleared')
       ON CONFLICT (key) DO UPDATE SET confirmed_at = now()`,
    );

    expect((await call('POST', `/library/posts/${postId}/comments`, authorTok, { body: 'text only' })).statusCode).toBe(201);
    expect((await call('POST', `/library/posts/${postId}/comments`, otherTok, { audioMediaId: 'media/a.mp3' })).statusCode).toBe(201);
    const both = await call('POST', `/library/posts/${postId}/comments`, authorTok, { body: 'text + audio', audioMediaId: 'media/b.mp3' });
    expect(both.statusCode).toBe(201);
    expect(both.json().body).toBe('text + audio');
    expect(both.json().audioMediaId).toBe('media/b.mp3');
  });

  it('nests replies to arbitrary depth with per-branch load-more', async () => {
    let parentId: string | undefined;
    const ids: string[] = [];
    for (let d = 0; d < 4; d++) {
      const res = await call('POST', `/library/posts/${postId}/comments`, authorTok, { body: `depth ${d}`, parentId });
      expect(res.statusCode).toBe(201);
      expect(res.json().depth).toBe(d);
      parentId = res.json().id;
      ids.push(parentId!);
    }
    // each level exposes its direct replies + a reply_count
    const lvl0Replies = await call('GET', `/library/comments/${ids[0]}/replies`);
    expect(lvl0Replies.json().comments.map((c: { id: string }) => c.id)).toContain(ids[1]);
    const parentRow = await pool.query<{ reply_count: number }>(`SELECT reply_count FROM library_comments WHERE id = $1`, [ids[0]]);
    expect(parentRow.rows[0]!.reply_count).toBe(1);
  });

  it('enforces ownership on edit and delete; delete tombstones + keeps the subtree', async () => {
    const parent = (await call('POST', `/library/posts/${postId}/comments`, authorTok, { body: 'parent' })).json();
    const child = (await call('POST', `/library/posts/${postId}/comments`, otherTok, { body: 'child', parentId: parent.id })).json();

    // another user can't edit/delete the author's comment
    expect((await call('PATCH', `/library/comments/${parent.id}`, otherTok, { body: 'hijack' })).statusCode).toBe(403);
    expect((await call('DELETE', `/library/comments/${parent.id}`, otherTok)).statusCode).toBe(403);

    const edit = await call('PATCH', `/library/comments/${parent.id}`, authorTok, { body: 'parent (edited)' });
    expect(edit.json().body).toBe('parent (edited)');

    // delete the parent → tombstone, child preserved
    expect((await call('DELETE', `/library/comments/${parent.id}`, authorTok)).statusCode).toBe(200);
    const dead = await pool.query<{ status: string; body: string | null }>(`SELECT status, body FROM library_comments WHERE id = $1`, [parent.id]);
    expect(dead.rows[0]!.status).toBe('removed');
    expect(dead.rows[0]!.body).toBeNull();
    const alive = await pool.query<{ status: string }>(`SELECT status FROM library_comments WHERE id = $1`, [child.id]);
    expect(alive.rows[0]!.status).toBe('visible'); // subtree kept
  });

  it('keeps the post comment count in step (create ++ / remove --)', async () => {
    const fresh = (await call('POST', '/library/posts', authorTok, { type: 'poem', title: 'Counted', body: 'x' })).json();
    const c1 = (await call('POST', `/library/posts/${fresh.id}/comments`, authorTok, { body: 'one' })).json();
    await call('POST', `/library/posts/${fresh.id}/comments`, otherTok, { body: 'two' });
    let post = (await call('GET', `/library/posts/${fresh.id}`)).json();
    expect(post.commentCount).toBe(2);

    await call('DELETE', `/library/comments/${c1.id}`, authorTok);
    post = (await call('GET', `/library/posts/${fresh.id}`)).json();
    expect(post.commentCount).toBe(1);
  });
});
