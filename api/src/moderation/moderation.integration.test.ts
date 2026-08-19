/** Chat moderation (KUR-086) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ModerationService, OFFENSE_1H } from './service.js';
import { ChatService } from '../chat/service.js';
import { FriendService } from '../friends/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

const notifier = { notifyUser: async () => undefined };

describe.skipIf(!DATABASE_URL)('chat moderation (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let mod: ModerationService;
  let chat: ChatService;
  let friends: FriendService;
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};

  const register = async (tag: string, ip: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `mod_${tag}_${suffix}@it.kurda.app`,
        username: `mod_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    return res.json().user.id as string;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    mod = new ModerationService(pool);
    friends = new FriendService(pool);
    chat = new ChatService(pool, friends, notifier, mod);
    id.a = await register('a', '10.86.1.1');
    id.b = await register('b', '10.86.2.1');
    id.c = await register('c', '10.86.3.1');
    const pairs: Array<[string, string]> = [[id.a!, id.b!], [id.a!, id.c!]];
    for (const [x, y] of pairs) {
      await friends.request(x, y);
      await friends.respond(y, x, true);
    }
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('masks profanity on delivery', async () => {
    const msg = await chat.send(id.a!, id.b!, 'you fuck, seriously');
    expect(msg.body).not.toContain('fuck');
    expect(msg.body).toContain('*');
    // stored masked too
    const stored = await pool.query<{ body: string }>(`SELECT body FROM dm_messages WHERE id = $1`, [msg.id]);
    expect(stored.rows[0]!.body).not.toContain('fuck');
  });

  it('report captures the message + surrounding context', async () => {
    await chat.send(id.a!, id.b!, 'first message');
    const target = await chat.send(id.a!, id.b!, 'reported message');
    await chat.send(id.a!, id.b!, 'after message');

    const { id: reportId } = await mod.report(id.b!, 'dm', target.id, 'rude');
    const row = await pool.query<{ context: unknown[]; reported_user_id: string }>(
      `SELECT context, reported_user_id FROM chat_reports WHERE id = $1`,
      [reportId],
    );
    expect(row.rows[0]!.reported_user_id).toBe(id.a);
    expect((row.rows[0]!.context as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it('escalates a repeat offender to an auto-mute', async () => {
    let last;
    for (let i = 0; i < OFFENSE_1H; i++) last = await mod.recordOffense(id.c!);
    expect(last!.mutedUntil).not.toBeNull();
    expect(await mod.isChatMuted(id.c!)).toBe(true);
    // …and a muted user can't send
    await expect(chat.send(id.c!, id.a!, 'let me talk')).rejects.toThrow(/muted from chat/i);
  });

  it('resolving a report as actioned records an offense against the author', async () => {
    const target = await chat.send(id.a!, id.b!, 'another one');
    const { id: reportId } = await mod.report(id.b!, 'dm', target.id);

    const before = await pool.query<{ offense_count: number }>(`SELECT offense_count FROM chat_offenses WHERE user_id = $1`, [id.a!]);
    await mod.resolveReport(reportId, 'actioned', id.b!);
    const after = await pool.query<{ offense_count: number }>(`SELECT offense_count FROM chat_offenses WHERE user_id = $1`, [id.a!]);
    expect(after.rows[0]!.offense_count).toBe((before.rows[0]?.offense_count ?? 0) + 1);
  });
});
