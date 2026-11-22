/** The service's daily sign-up ceiling: past it a sign-up gets the ordinary rate-limit answer, until midnight UTC. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('daily sign-up ceiling (integration)', () => {
  const config = loadConfig({ DATABASE_URL, REDIS_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal', SIGNUP_DAILY_CEILING: '2' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // the count lives in Redis (emptied before each file), so the first sign-up waits for the connection
    if (app.redis.status !== 'ready') await new Promise((resolve) => app.redis.once('ready', resolve));
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`%_${suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  const register = (n: number) =>
    app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `ceil${n}_${suffix}@it.kurda.app`,
        username: `ceil${n}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: `10.141.${n}.1`,
    });

  it('takes the day’s sign-ups, then answers the next with the rate-limit response and the wait until midnight', async () => {
    expect((await register(1)).statusCode).toBe(201);
    expect((await register(2)).statusCode).toBe(201);
    const third = await register(3);
    expect(third.statusCode).toBe(429);
    expect(third.json().code).toBe('RATE_LIMITED');
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(third.headers['retry-after'])).toBeLessThanOrEqual(86_400);
    const made = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [`ceil3_${suffix}@it.kurda.app`]);
    expect(made.rowCount).toBe(0);
  });
});
