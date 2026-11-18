/**
 * Trust velocity and spam enforcement on library writes, over HTTP with real Postgres and Redis. The other library
 * tests run without Redis, where velocity fails open, so this suite pins what applies once Redis is wired.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('library trust enforcement (integration)', () => {
  const config = loadConfig({ DATABASE_URL, REDIS_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Math.random().toString(36).slice(2, 8);
  const userIds: string[] = [];

  async function register(tag: string, ip: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `libtrust_${tag}_${suffix}@it.kurda.app`,
        username: `libt_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    const id = res.json().user.id;
    userIds.push(id);
    return res.json().tokens.accessToken;
  }

  const call = (method: 'POST' | 'GET', url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.31.0.9' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('throttles a new account past its per-hour post cap (429 TRUST_VELOCITY)', async () => {
    const tok = await register('vel', '10.31.0.1');
    // A `new` account gets two library posts an hour; distinct bodies so velocity, not spam, is what trips.
    expect((await call('POST', '/library/posts', tok, { type: 'poem', title: 'a', body: 'first poem' })).statusCode).toBe(201);
    expect((await call('POST', '/library/posts', tok, { type: 'poem', title: 'b', body: 'second poem' })).statusCode).toBe(201);
    const third = await call('POST', '/library/posts', tok, { type: 'poem', title: 'c', body: 'third poem' });
    expect(third.statusCode).toBe(429);
    expect(third.json().code).toBe('TRUST_VELOCITY');
  });

  it('auto-mutes a new account spamming near-identical comments (403 AUTO_MODERATED)', async () => {
    const tok = await register('spam', '10.31.0.2');
    // one post to comment on (under the post cap), then hammer the same comment
    const postId = (await call('POST', '/library/posts', tok, { type: 'story', title: 'host', body: 'a story to comment under' })).json().id;

    const dupe = { body: 'buy cheap followers now' };
    // Repeats 1-4 land (throttle does not block); the fifth trips REPEAT_MUTE and the account is muted first.
    for (let i = 0; i < 4; i++) {
      expect((await call('POST', `/library/posts/${postId}/comments`, tok, dupe)).statusCode).toBe(201);
    }
    const muted = await call('POST', `/library/posts/${postId}/comments`, tok, dupe);
    expect(muted.statusCode).toBe(403);
    expect(muted.json().code).toBe('AUTO_MODERATED');
  });
});
