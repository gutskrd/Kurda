/**
 * Every common mail provider can make an account and sign in (integration).
 *
 * Nothing about an address's provider is held against it: these all go through
 * the whole sign-up path (address rules, disposable list, CAPTCHA, risk scoring,
 * the banned-address registry, the insert) and come out 201. One address in
 * different letter case is one account, for sign-up and for sign-in.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { DISPOSABLE_DOMAINS_SAMPLE, PROVIDER_DOMAINS } from '../test/email-providers.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('signing up with any mail provider (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const created: string[] = [];

  // sign-up is limited per address (5 a minute, 10 accounts a day), which is
  // not what is being tested here: every request comes from its own
  let ip = 0;
  const nextIp = () => {
    ip += 1;
    return `10.77.${Math.floor(ip / 250)}.${(ip % 250) + 1}`;
  };
  let names = 0;
  const nextUsername = () => `prov${(names += 1)}_${suffix}`.slice(0, 30);

  const register = async (email: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email,
        username: nextUsername(),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: nextIp(),
    });
    if (res.statusCode === 201) created.push(res.json().user.id);
    return res;
  };
  const login = (email: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'a-strong-password1' },
      remoteAddress: nextIp(),
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [created]);
    await pool.end();
    await app.close();
  });

  it.each(PROVIDER_DOMAINS)('an address at %s', async (domain) => {
    const email = `heval_${suffix}@${domain}`;
    const res = await register(email);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().user.email).toBe(email);
  });

  it.each([
    ['a plus tag', `rojda+hevalo_${suffix}@icloud.com`],
    ['dots', `first.last.${suffix}@gmail.com`],
    ['capitals', `Rojda_${suffix}@iCloud.com`],
    ['an apostrophe', `o'brien.${suffix}@gmail.com`],
    ['digits, hyphens and underscores', `dil-an_99.${suffix}@outlook.com`],
    ['an Apple relay address', `abc123xyz${suffix}@privaterelay.appleid.com`],
    ['a subdomain under a country domain', `heval.${suffix}@mail.example.co.uk`],
  ])('%s', async (_, email) => {
    const res = await register(email);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().user.email).toBe(email);
  });

  it('an address with a space around it, stored without one', async () => {
    const res = await register(`  spaced_${suffix}@yahoo.com `);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().user.email).toBe(`spaced_${suffix}@yahoo.com`);
  });

  it('one address in another letter case is the same account', async () => {
    const first = await register(`case_${suffix}@icloud.com`);
    expect(first.statusCode, first.body).toBe(201);

    const again = await register(`Case_${suffix}@iCloud.COM`);
    expect(again.statusCode).toBe(409);
    expect(again.json().code).toBe('REGISTRATION_FAILED');

    // and signs in however it is typed
    for (const typed of [`case_${suffix}@icloud.com`, `CASE_${suffix}@ICLOUD.COM`, ` Case_${suffix}@iCloud.com `]) {
      const res = await login(typed);
      expect(res.statusCode, `${typed}: ${res.body}`).toBe(200);
      expect(res.json().user.id).toBe(first.json().user.id);
    }
  });

  it('an address that was signed up with capitals signs in in lower case', async () => {
    const first = await register(`Shiler_${suffix}@Me.com`);
    expect(first.statusCode, first.body).toBe(201);
    const res = await login(`shiler_${suffix}@me.com`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().user.id).toBe(first.json().user.id);
  });

  it('a different provider with the same name is a different account', async () => {
    expect((await register(`twin_${suffix}@icloud.com`)).statusCode).toBe(201);
    expect((await register(`twin_${suffix}@me.com`)).statusCode).toBe(201);
    expect((await register(`twin_${suffix}@gmail.com`)).statusCode).toBe(201);
  });

  it.each(DISPOSABLE_DOMAINS_SAMPLE)('but not a throwaway address at %s', async (domain) => {
    const res = await register(`bot_${suffix}@${domain}`);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('SIGNUP_REJECTED');
  });

  it('nor one that only resembles a provider with a line break in it', async () => {
    const res = await register(`x_${suffix}@icloud.com\r\nBcc: everyone@example.com`);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });
});
