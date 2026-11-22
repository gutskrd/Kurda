/**
 * What a group message meets before it lands, as a direct message does: the sender's hourly cap, the spam check, and
 * the day's messages over every group. Real Postgres and Redis.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { VELOCITY_CAPS, VELOCITY_WINDOW_MS } from '../trust/levels.js';
import { utcDay } from '../limits/counters.js';
import { activate } from '../test/activate.js';
import { addFriendsToGroup } from '../test/groups.js';
import { GroupService } from './service.js';
import { GROUP_MESSAGES_PER_DAY } from './chat-routes.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('group chat limits (integration)', () => {
  const config = loadConfig({ DATABASE_URL, REDIS_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const people: Record<string, { id: string; token: string }> = {};
  let gid = '';
  let n = 0;

  const register = async (tag: string): Promise<{ id: string; token: string }> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `gl_${tag}_${suffix}@it.kurda.app`,
        username: `gl_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: `10.143.${++n}.1`,
    });
    await activate(app, pool, res);
    return { id: res.json().user.id as string, token: res.json().tokens.accessToken as string };
  };

  const say = (who: { token: string }, body: string) =>
    app.inject({ method: 'POST', url: `/groups/${gid}/chat`, headers: { authorization: `Bearer ${who.token}` }, payload: { body }, remoteAddress: '10.143.200.1' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    for (const tag of ['owner', 'fast', 'busy', 'spam']) people[tag] = await register(tag);
    gid = (await new GroupService(pool).create(people.owner!.id, { name: `Limits ${suffix}` })).id;
    await addFriendsToGroup(pool, gid, people.owner!.id, people.fast!.id, people.busy!.id, people.spam!.id);
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('holds a new account to the hourly messages a direct message allows it, shared with them', async () => {
    expect((await say(people.fast!, 'Silav!')).statusCode).toBe(200);
    const bucket = Math.floor(Date.now() / VELOCITY_WINDOW_MS);
    await app.redis.set(`trust:vel:message:${people.fast!.id}:${bucket}`, String(VELOCITY_CAPS.new.message));
    const over = await say(people.fast!, 'Hûn çawa ne?');
    expect(over.statusCode).toBe(429);
    expect(over.json().code).toBe('TRUST_VELOCITY');
  });

  it('counts each message toward that cap', async () => {
    const bucket = Math.floor(Date.now() / VELOCITY_WINDOW_MS);
    const before = Number((await app.redis.get(`trust:vel:message:${people.owner!.id}:${bucket}`)) ?? 0);
    expect((await say(people.owner!, 'Bi xêr hatin.')).statusCode).toBe(200);
    expect(Number(await app.redis.get(`trust:vel:message:${people.owner!.id}:${bucket}`))).toBe(before + 1);
  });

  it('stops an account at the day’s messages and says when to come back', async () => {
    await app.redis.set(`group-chat:${utcDay()}:${people.busy!.id}`, String(GROUP_MESSAGES_PER_DAY));
    const over = await say(people.busy!, 'Yek din.');
    expect(over.statusCode).toBe(429);
    expect(over.json().code).toBe('RATE_LIMITED');
    expect(Number(over.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('mutes the same message sent again and again, before it lands', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 8 && !codes.includes(403); i++) codes.push((await say(people.spam!, 'Buy followers at example dot com')).statusCode);
    expect(codes.at(-1)).toBe(403);
    const landed = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM group_messages WHERE group_id = $1 AND sender_id = $2`, [gid, people.spam!.id]);
    expect(landed.rows[0]!.n).toBe(codes.length - 1);
  });
});
