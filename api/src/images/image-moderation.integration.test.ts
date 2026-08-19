/** Image/meme moderation: report → #102 queue → resolve remove (CI job). KUR-292. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ModerationQueueService } from '../moderation/queue-service.js';

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
      payload: { email: `im_${tag}_${suffix}@it.kurda.app`, username: `im_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: ip,
    });
    userIds.push(res.json().user.id);
    return { token: res.json().tokens.accessToken, id: res.json().user.id };
  };
  const call = (method: 'POST' | 'GET' | 'DELETE', url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.63.0.9' });
  const seedMedia = (key: string) =>
    pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status)
       VALUES ($1, 'image/webp', 1024, now(), 'cleared') ON CONFLICT (key) DO UPDATE SET confirmed_at = now()`,
      [key],
    );

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    queue = new ModerationQueueService(pool);
    authorTok = (await register('author', '10.63.0.1')).token;
    reporterTok = (await register('reporter', '10.63.0.2')).token;
    otherTok = (await register('other', '10.63.0.3')).token;
    modId = (await register('mod', '10.63.0.4')).id;
    await seedMedia(`image-post/mod_${suffix}.webp`);
    postId = (await call('POST', '/images', authorTok, { imageMediaId: `image-post/mod_${suffix}.webp`, caption: 'report me' })).json().id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM moderation_cases WHERE source = 'image_report'`);
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

    const added = await queue.sync();
    expect(added).toBeGreaterThanOrEqual(1);
    const mine = (await queue.queue()).filter((c) => c.source === 'image_report' && c.sourceRef === `image_post:${postId}`);
    expect(mine).toHaveLength(1); // mass-report deduped to a single case
    expect(mine[0]!.subjectUserId).toBeTruthy();
  });

  it('resolving with `remove` soft-deletes the post + closes the reports', async () => {
    await queue.sync();
    const target = (await queue.queue()).find((c) => c.sourceRef === `image_post:${postId}`)!;
    expect(await queue.resolve(target.id, modId, 'remove')).toBe(true);

    expect((await call('GET', `/images/${postId}`)).statusCode).toBe(404); // hidden
    const row = await pool.query<{ status: string }>(`SELECT status FROM image_posts WHERE id = $1`, [postId]);
    expect(row.rows[0]!.status).toBe('removed'); // retained for audit

    const reports = await pool.query<{ status: string }>(`SELECT status FROM image_reports WHERE target_id = $1`, [postId]);
    expect(reports.rows.every((r) => r.status === 'resolved')).toBe(true);
  });

  it('reports a comment into the queue and removes it (tombstone + count drop)', async () => {
    await seedMedia(`image-post/mod2_${suffix}.webp`);
    const fresh = (await call('POST', '/images', authorTok, { imageMediaId: `image-post/mod2_${suffix}.webp` })).json();
    const comment = (await call('POST', `/images/${fresh.id}/comments`, otherTok, { body: 'abusive comment' })).json();
    expect((await pool.query(`SELECT comment_count FROM image_posts WHERE id = $1`, [fresh.id])).rows[0].comment_count).toBe(1);

    expect((await call('POST', `/images/comments/${comment.id}/report`, reporterTok, { reason: 'abuse' })).statusCode).toBe(200);
    await queue.sync();
    const c = (await queue.queue()).find((x) => x.sourceRef === `image_comment:${comment.id}`)!;
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
