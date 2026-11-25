/** In-app notification inbox against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { InboxService } from './inbox-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('notification inbox (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let inbox: InboxService;
  const suffix = Date.now().toString(36);
  let userId = '';
  let otherId = '';
  const tokens = new Map<string, string>();

  async function register(name: string, ip: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    tokens.set(res.json().user.id, res.json().tokens.accessToken);
    return res.json().user.id;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    inbox = new InboxService(pool);
    userId = await register('inboxA', '10.97.0.1');
    otherId = await register('inboxB', '10.97.0.2');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('records, lists newest-first, and counts unread', async () => {
    await inbox.record(userId, { category: 'streak', title: 'One', body: 'b1' });
    await inbox.record(userId, { category: 'events', title: 'Two', body: 'b2', data: { screen: 'EventQuests' } });
    await inbox.record(userId, { category: 'friends', title: 'Three', body: 'b3' });

    const list = await inbox.list(userId);
    expect(list.map((i) => i.title)).toEqual(['Three', 'Two', 'One']);
    expect(list[1]!.data).toEqual({ screen: 'EventQuests' });
    expect(await inbox.unreadCount(userId)).toBe(3);
  });

  it('marks one read (owner-scoped) and syncs the count', async () => {
    const list = await inbox.list(userId);
    const target = list[0]!.id;
    expect(await inbox.markRead(otherId, target)).toBe(false); // not the owner
    expect(await inbox.markRead(userId, target)).toBe(true);
    expect(await inbox.markRead(userId, target)).toBe(false); // already read
    expect(await inbox.unreadCount(userId)).toBe(2);
  });

  it('marks all read', async () => {
    expect(await inbox.markAllRead(userId)).toBe(2);
    expect(await inbox.unreadCount(userId)).toBe(0);
    expect(await inbox.markAllRead(userId)).toBe(0); // nothing left
  });

  it('takes one away for its owner only, through the route as well', async () => {
    await inbox.record(userId, { category: 'friends', title: 'Four', body: 'b4' });
    const [four] = await inbox.list(userId);
    expect(four!.title).toBe('Four');
    expect(await inbox.remove(otherId, four!.id)).toBe(false); // not the owner
    // an account is used once its email is confirmed
    await pool.query('UPDATE users SET email_verified_at = now() WHERE id = $1', [userId]);
    const headers = { authorization: `Bearer ${tokens.get(userId)!}` };
    const removed = await app.inject({ method: 'DELETE', url: `/me/notifications/${four!.id}`, headers });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toEqual({ ok: true, unread: 0 });
    expect((await inbox.list(userId)).map((i) => i.title)).toEqual(['Three', 'Two', 'One']);
    // gone already, or never theirs: nothing to take away
    expect((await app.inject({ method: 'DELETE', url: `/me/notifications/${four!.id}`, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/me/notifications/not-an-id', headers })).statusCode).toBe(400);
  });

  it('stops naming a gift’s sender in the list once a block stands between them, in chat and on a post', async () => {
    const chat = { kind: 'gift', fromUserId: otherId, fromName: 'inboxB', sku: 'sticker-lale' };
    const post = { kind: 'post_gift', fromUserId: otherId, fromName: 'inboxB', postType: 'library', postId: otherId };
    await inbox.record(userId, { category: 'friends', title: 'You have a gift', body: 'inboxB sent you Lale.', data: chat });
    await inbox.record(userId, { category: 'friends', title: 'A gift on your post', body: 'inboxB gave your post Lale.', data: post });
    const named = await inbox.list(userId, 2);
    expect(named.map((i) => i.data.fromName)).toEqual(['inboxB', 'inboxB']);

    await pool.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [otherId, userId]);
    try {
      const unnamed = await inbox.list(userId, 2);
      expect(unnamed.map((i) => i.data.fromName)).toEqual([undefined, undefined]);
      expect(unnamed.map((i) => i.body)).toEqual(['A Hevalo member gave your post a gift.', 'A Hevalo member sent you a gift.']);
      expect(unnamed[0]!.data).toMatchObject({ kind: 'post_gift', fromUserId: otherId, postId: otherId });
      expect((await inbox.recent(userId, 2)).items.map((i) => i.data.fromName)).toEqual([undefined, undefined]);
    } finally {
      await pool.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [otherId, userId]);
    }
  });
});
