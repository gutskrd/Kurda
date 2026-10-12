/**
 * The ranked quiz is gone (Stories replaced it), and with it every way into
 * a live quiz match: the queue, private rooms, friend challenges and rematches.
 *
 * Kept as a regression test because one of those routes was removed before,
 * for a reason that still holds: `POST /matchmaking/party` let a caller start
 * a game with a roster they named — anyone, including a stranger's child. None
 * of these may come back by accident with an old file.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('the ranked quiz is gone (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let token = '';
  let me = '';
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `quizgone_${suffix}@it.kurda.app`,
        username: `quizgone_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.150.0.1',
    });
    await activate(app, pool, res);
    me = res.json().user.id;
    token = res.json().tokens.accessToken;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [me]);
    await pool.end();
    await app.close();
  });

  const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload, remoteAddress: '10.150.0.2' });

  it.each([
    ['POST', '/matchmaking/queue', { mode: '1v1' }],
    ['POST', '/matchmaking/cancel', {}],
    ['GET', '/matchmaking/status', undefined],
    ['POST', '/matchmaking/party', { mode: '1v1', userIds: [] }],
    ['POST', '/rooms', { mode: 'ffa' }],
    ['POST', '/rooms/ABC234/join', {}],
    ['GET', '/rooms/ABC234', undefined],
    ['POST', '/challenges', { userId: '00000000-0000-4000-8000-000000000000' }],
    ['GET', '/challenges/00000000-0000-4000-8000-000000000000', undefined],
    ['POST', '/games/match:1/rematch', {}],
    ['GET', '/games/match:1/state', undefined],
  ] as const)('%s %s answers 404', async (method, url, payload) => {
    const res = await call(method, url, payload);
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('NOT_FOUND');
  });

  it('still reads the ratings people earned', async () => {
    const res = await call('GET', '/me/rating');
    expect(res.statusCode).toBe(200);
  });
});
