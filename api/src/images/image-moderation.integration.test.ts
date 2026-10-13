/** Image/meme moderation: report → #102 queue → resolve remove (CI job). KUR-292. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ModerationQueueService } from '../moderation/queue-service.js';
import { activate } from '../test/activate.js';
import { seedPictureUpload } from '../test/media.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('image moderation (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let queue: ModerationQueueService;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];
  let authorTok: string, reporterTok: string, otherTok: string, modId: string, postId: string;

  const register = async (tag: string, ip: string): Promise<{ token: string; id: string }> => {
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: `im_${tag}_${suffix}@it.kurda.app`, username: `im_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    userIds.push(res.json().user.id);
    return { token: res.json().tokens.accessToken, id: res.json().user.id };
  };
  const call = (method: 'POST' | 'GET' | 'DELETE', url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.63.0.9' });
  // the upload a post may use: its author's own, cleared, unused
  let authorId = '';
  const seedMedia = (key: string) => seedPictureUpload(pool, key, authorId);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    queue = new ModerationQueueService(pool);
    const author = await register('author', '10.63.0.1');
    authorTok = author.token;
    authorId = author.id;
    reporterTok = (await register('reporter', '10.63.0.2')).token;
    otherTok = (await register('other', '10.63.0.3')).token;
    modId = (await register('mod', '10.63.0.4')).id;
    await seedMedia(`image-post/mod_${suffix}.webp`);
    postId = (await call('POST', '/images', authorTok, { imageMediaId: `image-post/mod_${suffix}.webp`, caption: 'report me' })).json().id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM moderation_cases WHERE source = 'report' AND target_type IN ('image_post','image_comment') AND subject_user_id = ANY($1)`, [userIds]);
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('users report a post; mass-reports collapse to one queue case', async () => {
    expect((await call('POST', `/images/${postId}/report`, undefined, { reason: 'x' })).statusCode).toBe(401);

    const r1 = await call('POST', `/images/${postId}/report`, reporterTok, { reason: 'offensive' });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().reported).toBe(true);
    expect((await call('POST', `/images/${postId}/report`, reporterTok, { reason: 'again' })).json().deduped).toBe(true);
    await call('POST', `/images/${postId}/report`, otherTok, { reason: 'me too' });

    // Changed on purpose: the old route writes through the one report service
    // now, so the report is a case at once (no sync), from the 'report' source.
    const mine = (await queue.queue({ q: postId })).cases.filter((c) => c.source === 'report');
    expect(mine).toHaveLength(1); // mass-report deduped to a single case
    expect(mine[0]!.subject).toBeTruthy();
    expect(mine[0]!.reportCount).toBe(2);
    expect(mine[0]!.reporterCount).toBe(2);
  });

  it('resolving with `remove` soft-deletes the post + closes the reports', async () => {
    const target = (await queue.queue({ q: postId })).cases.find((c) => c.source === 'report')!;
    expect(await queue.resolve(target.id, modId, 'remove')).toBe(true);

    expect((await call('GET', `/images/${postId}`)).statusCode).toBe(404); // hidden
    const row = await pool.query<{ status: string }>(`SELECT status FROM image_posts WHERE id = $1`, [postId]);
    expect(row.rows[0]!.status).toBe('removed'); // retained for audit

    const reports = await pool.query<{ status: string }>(`SELECT status FROM reports WHERE target_id = $1`, [postId]);
    expect(reports.rows).toHaveLength(2);
    expect(reports.rows.every((r) => r.status === 'actioned')).toBe(true);
  });

  it('reports a comment into the queue and removes it (tombstone + count drop)', async () => {
    await seedMedia(`image-post/mod2_${suffix}.webp`);
    const fresh = (await call('POST', '/images', authorTok, { imageMediaId: `image-post/mod2_${suffix}.webp` })).json();
    const comment = (await call('POST', `/images/${fresh.id}/comments`, otherTok, { body: 'abusive comment' })).json();
    expect((await pool.query(`SELECT comment_count FROM image_posts WHERE id = $1`, [fresh.id])).rows[0].comment_count).toBe(1);

    expect((await call('POST', `/images/comments/${comment.id}/report`, reporterTok, { reason: 'abuse' })).statusCode).toBe(200);
    const c = (await queue.queue({ q: comment.id })).cases.find((x) => x.source === 'report')!;
    expect(c).toBeTruthy();

    expect(await queue.resolve(c.id, modId, 'remove')).toBe(true);
    const row = await pool.query<{ status: string; body: string | null }>(`SELECT status, body FROM image_comments WHERE id = $1`, [comment.id]);
    expect(row.rows[0]!.status).toBe('removed');
    expect(row.rows[0]!.body).toBeNull();
    expect((await pool.query(`SELECT comment_count FROM image_posts WHERE id = $1`, [fresh.id])).rows[0].comment_count).toBe(0);
  });

  it('cannot report a non-existent item', async () => {
    expect((await call('POST', `/images/${'0'.repeat(8)}-0000-4000-8000-000000000000/report`, reporterTok, {})).statusCode).toBe(404);
  });
});
