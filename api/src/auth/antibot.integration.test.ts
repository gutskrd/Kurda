/** Anti-bot behavior on live routes (CI integration job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('signup anti-bot (integration)', () => {
  let openApp: FastifyInstance; // no CAPTCHA configured
  let guardedApp: FastifyInstance; // TURNSTILE_SECRET set
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    openApp = buildApp(loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' }));
    guardedApp = buildApp(
      loadConfig({
        DATABASE_URL,
        NODE_ENV: 'test',
        LOG_LEVEL: 'fatal',
        TURNSTILE_SECRET: 'ts-secret-for-tests',
      }),
    );
    await openApp.ready();
    await guardedApp.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@%'`);
    await pool.end();
    await openApp.close();
    await guardedApp.close();
  });

  const register = (app: FastifyInstance, body: Record<string, unknown>, ip: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: `ab_${suffix}`.slice(0, 30), password: 'a-strong-password',
        acceptTerms: true, ...body },
      remoteAddress: ip,
    });

  it('rejects disposable emails with the generic rejection', async () => {
    const res = await register(openApp, { email: `bot_${suffix}@mailinator.com` }, '10.14.0.1');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('SIGNUP_REJECTED');
    expect(res.json().message).not.toMatch(/disposable|blocklist|captcha/i);
  });

  it('rejects missing CAPTCHA identically when Turnstile is configured', async () => {
    const res = await register(guardedApp, { email: `human_${suffix}@gmail.com` }, '10.14.0.2');
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('SIGNUP_REJECTED');

    // byte-identical shape with the disposable rejection: nothing leaks
    const disposable = await register(openApp, { email: `bot2_${suffix}@yopmail.com` }, '10.14.0.3');
    expect(disposable.json().code).toBe(res.json().code);
    expect(disposable.json().message).toBe(res.json().message);
  });

  it('normal signup still works without CAPTCHA configured', async () => {
    const res = await register(
      openApp,
      { email: `fine_${suffix}@gmail.com`, username: `fine_${suffix}`.slice(0, 30) },
      '10.14.0.4',
    );
    expect(res.statusCode).toBe(201);
  });

  it('password-reset request with failing CAPTCHA still returns the neutral 200', async () => {
    const res = await guardedApp.inject({
      method: 'POST',
      url: '/auth/request-password-reset',
      payload: { email: `whoever_${suffix}@gmail.com` },
      remoteAddress: '10.14.0.5',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().sent).toBe(true);
  });
});
