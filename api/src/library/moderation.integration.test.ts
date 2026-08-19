/** Community library moderation: report → #102 queue → resolve (CI job). KUR-285. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ModerationQueueService } from '../moderation/queue-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('library moderation (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let queue: ModerationQueueService;
  const suffix = Date.now().toString(36);
  const userIds: string[] = [];
  let authorTok: string, reporterTok: string, otherTok: string, modId: string, postId: string;

  async function register(tag: string, ip: string): Promise<{ token: string; id: string }> {
    const res = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { email: `lm_${tag}_${suffix}@it.kurda.app`, username: `lm_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: ip,
    });
    userIds.push(res.json().user.id);
    return { token: res.json().tokens.accessToken, id: res.json().user.id };
  }
  const call = (method: 'POST' | 'GET' | 'DELETE', url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.50.0.9' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    queue = new ModerationQueueService(pool);
    authorTok = (await register('author', '10.50.0.1')).token;
    reporterTok = (await register('reporter', '10.50.0.2')).token;
    otherTok = (await register('other', '10.50.0.3')).token;
    modId = (await register('mod', '10.50.0.4')).id;
    postId = (await call('POST', '/library/posts', authorTok, { type: 'story', title: 'Reported', body: 'A tale worth reviewing.' })).json().id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM moderation_cases WHERE source = 'library_report'`);
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('users report a post; mass-reports collapse to one queue case', async () => {
    expect((await call('POST', `/library/posts/${postId}/report`, undefined, { reason: 'x' })).statusCode).toBe(401);

    const r1 = await call('POST', `/library/posts/${postId}/report`, reporterTok, { reason: 'offensive' });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().reported).toBe(true);
    // same reporter again → deduped; a different reporter → still one item
    expect((await call('POST', `/library/posts/${postId}/report`, reporterTok, { reason: 'again' })).json().deduped).toBe(true);
    await call('POST', `/library/posts/${postId}/report`, otherTok, { reason: 'me too' });

    const added = await queue.sync();
    expect(added).toBeGreaterThanOrEqual(1);
    const cases = await queue.queue();
    const mine = cases.filter((c) => c.source === 'library_report' && c.sourceRef === `library_post:${postId}`);
    expect(mine).toHaveLength(1); // mass-report deduped to a single case
    expect(mine[0]!.subjectUserId).toBeTruthy();
  });

  it('resolving with `remove` soft-deletes the post + closes the reports', async () => {
    await queue.sync();
    const target = (await queue.queue()).find((c) => c.sourceRef === `library_post:${postId}`)!;
    expect(await queue.resolve(target.id, modId, 'remove')).toBe(true);

    // post hidden from public read + browse, retained in the table
    expect((await call('GET', `/library/posts/${postId}`)).statusCode).toBe(404);
    const row = await pool.query<{ status: string }>(`SELECT status FROM library_posts WHERE id = $1`, [postId]);
    expect(row.rows[0]!.status).toBe('removed'); // retained for audit

    const reports = await pool.query<{ status: string }>(`SELECT status FROM library_reports WHERE target_id = $1`, [postId]);
    expect(reports.rows.every((r) => r.status === 'resolved')).toBe(true);
  });

  it('reports a comment (text or audio) into the queue and bans from it', async () => {
    const fresh = (await call('POST', '/library/posts', authorTok, { type: 'poem', title: 'P2', body: 'x' })).json();
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status)
       VALUES ('media/voice.mp3','audio/mpeg',2048,now(),'cleared') ON CONFLICT (key) DO UPDATE SET confirmed_at = now()`,
    );
    const audioComment = (await call('POST', `/library/posts/${fresh.id}/comments`, authorTok, { audioMediaId: 'media/voice.mp3' })).json();

    expect((await call('POST', `/library/comments/${audioComment.id}/report`, reporterTok, { reason: 'audio abuse' })).statusCode).toBe(200);
    await queue.sync();
    const c = (await queue.queue()).find((x) => x.sourceRef === `library_comment:${audioComment.id}`)!;
    expect(c).toBeTruthy();

    // ban the comment author from the queue
    expect(await queue.resolve(c.id, modId, 'ban')).toBe(true);
    const u = await pool.query<{ banned_at: Date | null }>(`SELECT banned_at FROM users WHERE id = $1`, [audioComment.authorId]);
    expect(u.rows[0]!.banned_at).not.toBeNull();
  });

  it('auto-screens spammy post text into the queue as a text flag (#293)', async () => {
    const spam = await call('POST', '/library/posts', otherTok, {
      type: 'story', title: 'WIN', body: 'FREE MONEY crypto giveaway click here http://a.io http://b.io http://c.io',
    });
    expect(spam.statusCode).toBe(201);
    const flag = await pool.query(`SELECT 1 FROM moderation_flags WHERE content_ref = $1 AND surface = 'library'`, [spam.json().id]);
    expect(flag.rowCount).toBe(1);
  });
});
