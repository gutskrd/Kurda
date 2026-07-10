/** 1:1 direct messages (KUR-083) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ChatService } from './service.js';
import { FriendService } from '../friends/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

class FakeNotifier {
  events: Array<{ uid: string; ev: Record<string, unknown> }> = [];
  async notifyUser(uid: string, ev: Record<string, unknown>): Promise<void> {
    this.events.push({ uid, ev });
  }
  to(uid: string, type: string): boolean {
    return this.events.some((e) => e.uid === uid && e.ev.type === type);
  }
}

describe.skipIf(!DATABASE_URL)('direct messages (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let chat: ChatService;
  let friends: FriendService;
  const notifier = new FakeNotifier();
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};

  const register = async (tag: string, ip: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `dm_${tag}_${suffix}@it.kurda.app`,
        username: `dm_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    return res.json().user.id as string;
  };
  const makeFriends = async (a: string, b: string): Promise<void> => {
    await friends.request(a, b);
    await friends.respond(b, a, true);
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    friends = new FriendService(pool);
    chat = new ChatService(pool, friends, notifier);
    id.a = await register('a', '10.83.1.1');
    id.b = await register('b', '10.83.2.1');
    id.c = await register('c', '10.83.3.1');
    id.d = await register('d', '10.83.4.1');
    await makeFriends(id.a!, id.b!);
    await makeFriends(id.a!, id.d!);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('sends a message between friends, persists it, and pushes to the recipient', async () => {
    const msg = await chat.send(id.a!, id.b!, '  Silav, çawa yî?  ');
    expect(msg.body).toBe('Silav, çawa yî?'); // trimmed
    expect(notifier.to(id.b!, 'dm')).toBe(true);

    const hist = await chat.history(id.b!, id.a!);
    expect(hist.map((m) => m.body)).toContain('Silav, çawa yî?');
    expect(hist[hist.length - 1]!.senderId).toBe(id.a);
  });

  it('rejects messaging a non-friend and over-long messages', async () => {
    await expect(chat.send(id.a!, id.c!, 'hi')).rejects.toThrow(/only message friends/i);
    await expect(chat.send(id.a!, id.b!, 'x'.repeat(2001))).rejects.toThrow(/2000/);
  });

  it('read receipt marks messages read and notifies the sender', async () => {
    const n = await chat.markRead(id.b!, id.a!);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(notifier.to(id.a!, 'dm_read')).toBe(true);
  });

  it('a blocked recipient silently drops the message (sender sees it sent)', async () => {
    await friends.block(id.d!, id.a!); // D blocks A
    notifier.events = [];
    const msg = await chat.send(id.a!, id.d!, 'are you there?');
    expect(msg.body).toBe('are you there?'); // sender sees it as sent
    expect(notifier.to(id.d!, 'dm')).toBe(false); // but nothing was pushed
    expect(await chat.history(id.a!, id.d!)).toHaveLength(0); // and nothing stored
  });

  it('lists conversations with last message + unread counts', async () => {
    await chat.send(id.b!, id.a!, 'baş im, spas!'); // B → A, unread for A
    const convosForA = await chat.conversations(id.a!);
    const withB = convosForA.find((c) => c.userId === id.b);
    expect(withB).toBeTruthy();
    expect(withB!.lastMessage).toBe('baş im, spas!');
    expect(withB!.unread).toBeGreaterThanOrEqual(1);
    expect(withB!.lastFromMe).toBe(false);
  });
});
