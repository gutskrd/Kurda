/** Friend system (KUR-081) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { FriendService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('friend system (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let friends: FriendService;
  const suffix = Date.now().toString(36);
  const id: Record<string, string> = {};

  const register = async (tag: string, ip: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `fr_${tag}_${suffix}@it.kurda.app`,
        username: `fr_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    return res.json().user.id as string;
  };
  const has = (list: Array<{ userId: string }>, userId: string): boolean => list.some((x) => x.userId === userId);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    friends = new FriendService(pool);
    id.a = await register('a', '10.81.1.1');
    id.b = await register('b', '10.81.2.1');
    id.c = await register('c', '10.81.3.1');
    id.d = await register('d', '10.81.4.1');
    id.e = await register('e', '10.81.5.1');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('request → accept makes a mutual friendship', async () => {
    expect(await friends.request(id.a!, id.b!)).toBe('requested');
    expect(has(await friends.incomingRequests(id.b!), id.a!)).toBe(true);
    expect(await friends.respond(id.b!, id.a!, true)).toBe('accepted');
    expect(has(await friends.list(id.a!), id.b!)).toBe(true);
    expect(has(await friends.list(id.b!), id.a!)).toBe(true);
  });

  it('decline leaves no friendship', async () => {
    await friends.request(id.a!, id.c!);
    expect(await friends.respond(id.c!, id.a!, false)).toBe('declined');
    expect(has(await friends.incomingRequests(id.c!), id.a!)).toBe(false);
    expect(has(await friends.list(id.a!), id.c!)).toBe(false);
  });

  it('a mutual request auto-accepts', async () => {
    await friends.request(id.a!, id.d!);
    expect(await friends.request(id.d!, id.a!)).toBe('accepted');
    expect(has(await friends.list(id.a!), id.d!)).toBe(true);
  });

  it('blocking cancels a pending request silently and hides the requester', async () => {
    await friends.request(id.e!, id.a!); // E asks to be A's friend
    expect(has(await friends.incomingRequests(id.a!), id.e!)).toBe(true);

    await friends.block(id.a!, id.e!); // A blocks E
    // the request vanishes for both, with no notification
    expect(has(await friends.incomingRequests(id.a!), id.e!)).toBe(false);
    expect(await friends.areBlocked(id.a!, id.e!)).toBe(true);
    // E re-requesting is silently swallowed (never told they're blocked)
    expect(await friends.request(id.e!, id.a!)).toBe('silent');
    expect(has(await friends.incomingRequests(id.a!), id.e!)).toBe(false);
  });

  it('blocking removes an existing friendship and hides both users', async () => {
    // A and B are friends from the first test
    await friends.block(id.a!, id.b!);
    expect(has(await friends.list(id.a!), id.b!)).toBe(false);
    expect(has(await friends.list(id.b!), id.a!)).toBe(false);
    expect(await friends.areBlocked(id.b!, id.a!)).toBe(true);
    // A can't re-add B until unblocking
    await expect(friends.request(id.a!, id.b!)).rejects.toThrow(/unblock/i);
    await friends.unblock(id.a!, id.b!);
    expect(await friends.areBlocked(id.a!, id.b!)).toBe(false);
  });

  it('rejects friending or blocking yourself', async () => {
    await expect(friends.request(id.a!, id.a!)).rejects.toThrow(/yourself/i);
    await expect(friends.block(id.a!, id.a!)).rejects.toThrow(/yourself/i);
  });

  it('suggests friends-of-friends ranked by mutual count', async () => {
    // fresh graph (independent of the mutated a–e users): X–Y and Y–Z are friends
    const x = await register('sx', '10.81.10.1');
    const y = await register('sy', '10.81.10.2');
    const z = await register('sz', '10.81.10.3');
    await friends.request(x, y);
    await friends.respond(y, x, true);
    await friends.request(y, z);
    await friends.respond(z, y, true);

    const forX = await friends.suggestions(x);
    const zSug = forX.find((s) => s.userId === z);
    expect(zSug).toBeTruthy();
    expect(zSug!.mutualCount).toBe(1); // Y is the mutual friend
    expect(has(forX, y)).toBe(false); // already a friend
    expect(has(forX, x)).toBe(false); // never yourself
  });

  it('reflects online presence from last_seen_at', async () => {
    const p = await register('pon', '10.81.20.1');
    const q = await register('pof', '10.81.20.2');
    await friends.request(p, q);
    await friends.respond(q, p, true);
    // Q just heartbeated; P never did
    await pool.query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [q]);

    const forP = await friends.list(p);
    expect(forP.find((x) => x.userId === q)?.online).toBe(true);
    const forQ = await friends.list(q);
    expect(forQ.find((x) => x.userId === p)?.online).toBe(false);
  });
});
