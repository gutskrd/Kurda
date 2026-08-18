/** Reactions & threaded comments on image/meme posts (KUR-291), via HTTP. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('image reactions & comments (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];
  let authorTok: string, otherTok: string, postId: string;

  const register = async (tag: string, ip: string): Promise<{ token: string; id: string }> => {
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: `ix_${tag}_${suffix}@it.kurda.app`, username: `ix_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: ip,
    });
    userIds.push(res.json().user.id);
    return { token: res.json().tokens.accessToken, id: res.json().user.id };
  };
  const call = (method: 'POST' | 'GET' | 'PATCH' | 'DELETE' | 'PUT', url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.62.0.9' });
  const postCount = async (col: 'reaction_count' | 'comment_count'): Promise<number> =>
    Number((await pool.query(`SELECT ${col} AS c FROM image_posts WHERE id = $1`, [postId])).rows[0]!.c);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    authorTok = (await register('author', '10.62.0.1')).token;
    otherTok = (await register('other', '10.62.0.2')).token;
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status)
       VALUES ($1, 'image/webp', 1024, now(), 'cleared') ON CONFLICT (key) DO NOTHING`,
      [`image-post/${suffix}.webp`],
    );
    postId = (await call('POST', '/images', authorTok, { imageMediaId: `image-post/${suffix}.webp`, caption: 'react to me' })).json().id;
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('sets, changes, and clears a reaction; count + breakdown + mine track it', async () => {
    const set = await call('PUT', `/images/${postId}/reaction`, authorTok, { reaction: 'laugh' });
    expect(set.statusCode).toBe(200);
    expect(set.json().mine).toBe('laugh');
    expect(set.json().total).toBe(1);
    expect(await postCount('reaction_count')).toBe(1);

    // a second user reacts differently
    await call('PUT', `/images/${postId}/reaction`, otherTok, { reaction: 'love' });
    expect(await postCount('reaction_count')).toBe(2);

    // author changes emoji — still one reaction from them (count unchanged)
    const changed = await call('PUT', `/images/${postId}/reaction`, authorTok, { reaction: 'wow' });
    expect(changed.json().mine).toBe('wow');
    expect(changed.json().total).toBe(2);
    expect(await postCount('reaction_count')).toBe(2);

    // public read reflects the breakdown; a guest sees mine=null
    const pub = await call('GET', `/images/${postId}/reactions`);
    expect(pub.json().counts.wow).toBe(1);
    expect(pub.json().counts.love).toBe(1);
    expect(pub.json().mine).toBeNull();

    // author clears
    const cleared = await call('DELETE', `/images/${postId}/reaction`, authorTok);
    expect(cleared.json().mine).toBeNull();
    expect(await postCount('reaction_count')).toBe(1);

    expect((await call('PUT', `/images/${postId}/reaction`, undefined, { reaction: 'like' })).statusCode).toBe(401);
    expect((await call('PUT', `/images/${postId}/reaction`, authorTok, { reaction: 'nope' })).statusCode).toBe(400);
  });

  it('threads comments, maintains counts, and tombstones on delete preserving replies', async () => {
    const top = await call('POST', `/images/${postId}/comments`, authorTok, { body: 'top-level' });
    expect(top.statusCode).toBe(201);
    const topId = top.json().id;
    expect(await postCount('comment_count')).toBe(1);

    const reply = await call('POST', `/images/${postId}/comments`, otherTok, { body: 'a reply', parentId: topId });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().depth).toBe(1);
    expect(await postCount('comment_count')).toBe(2);

    const list = await call('GET', `/images/${postId}/comments`);
    expect(list.json().comments.some((c: { id: string; replyCount: number }) => c.id === topId && c.replyCount === 1)).toBe(true);
    const replies = await call('GET', `/images/comments/${topId}/replies`);
    expect(replies.json().comments[0].body).toBe('a reply');

    // non-author cannot edit/delete someone else's comment
    expect((await call('PATCH', `/images/comments/${topId}`, otherTok, { body: 'hijack' })).statusCode).toBe(403);
    expect((await call('DELETE', `/images/comments/${topId}`, otherTok)).statusCode).toBe(403);

    // author edits then deletes the top-level → tombstone, count drops, reply kept
    expect((await call('PATCH', `/images/comments/${topId}`, authorTok, { body: 'edited' })).json().body).toBe('edited');
    expect((await call('DELETE', `/images/comments/${topId}`, authorTok)).statusCode).toBe(200);
    expect(await postCount('comment_count')).toBe(1); // only the reply counts now

    const row = await pool.query<{ status: string; body: string | null }>(`SELECT status, body FROM image_comments WHERE id = $1`, [topId]);
    expect(row.rows[0]!.status).toBe('removed');
    expect(row.rows[0]!.body).toBeNull();
    // the reply still exists (subtree preserved)
    const stillThere = await call('GET', `/images/comments/${topId}/replies`);
    expect(stillThere.json().comments).toHaveLength(1);

    // guests cannot comment; empty body rejected by schema
    expect((await call('POST', `/images/${postId}/comments`, undefined, { body: 'hi' })).statusCode).toBe(401);
    expect((await call('POST', `/images/${postId}/comments`, authorTok, { body: '' })).statusCode).toBe(400);
  });
});
