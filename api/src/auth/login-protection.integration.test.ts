/**
 * Sign-in protection against real Postgres and Redis: known devices keep their
 * own budget, the CAPTCHA steps in before any wall, a network is locked only
 * when it sprays, a surge everywhere asks every new device for the challenge,
 * the owner hears about it, and passwords and sessions are looked after.
 *
 * The CAPTCHA and the breached-password corpus are stood in for at `fetch`:
 * nothing here reaches the internet.
 */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { Redis } from 'ioredis';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { createEmailToken } from './email-tokens.js';
import { BREACH_RANGE_URL } from './breached-password.js';
import { CAPTCHA_AFTER_FAILURES, LockoutService } from './lockout.js';
import { LoginSurge, SURGE_FAILURES_PER_MINUTE, SURGE_FLAG_KEY } from './login-surge.js';
import { AuthService, RESET_EMAILS_PER_HOUR } from './service.js';
import { GdprService, DELETION_GRACE_DAYS } from '../gdpr/service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const GOOD_CAPTCHA = 'good-captcha-token';
const PASSWORD = 'a-strong-password1';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex').toUpperCase();

describe.skipIf(!DATABASE_URL)('sign-in protection (integration)', () => {
  const config = loadConfig({
    DATABASE_URL,
    REDIS_URL,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    TURNSTILE_SECRET: 'ts-secret-for-tests',
    PASSWORD_BREACH_CHECK: 'true',
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  let ip = 0;
  const nextIp = () => `10.184.${Math.floor((ip += 1) / 250)}.${(ip % 250) + 1}`;

  /** what the breached-password corpus holds, by SHA-1; and whether it answers at all */
  const breached = new Set<string>();
  let corpusDown = false;
  const rangesAsked: string[] = [];

  interface Account {
    id: string;
    email: string;
    access: string;
    refresh: string;
  }

  async function register(name: string, deviceId?: string, password = PASSWORD, from = nextIp()) {
    return app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: deviceId ? { 'x-device-id': deviceId } : {},
      payload: {
        email: `${name}_${s}@it.kurda.app`,
        username: `${name}_${s}`.slice(0, 30),
        password,
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
        captchaToken: GOOD_CAPTCHA,
      },
      remoteAddress: from,
    });
  }
  async function account(name: string, deviceId?: string, from?: string): Promise<Account> {
    const res = await register(name, deviceId, PASSWORD, from);
    expect(res.statusCode, res.body).toBe(201);
    await activate(app, pool, res);
    const body = res.json();
    return { id: body.user.id, email: body.user.email, access: body.tokens.accessToken, refresh: body.tokens.refreshToken };
  }
  const login = (email: string, password: string, opts: { deviceId?: string; captchaToken?: string; ip?: string } = {}) =>
    app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: opts.deviceId ? { 'x-device-id': opts.deviceId } : {},
      payload: { email, password, ...(opts.captchaToken ? { captchaToken: opts.captchaToken } : {}) },
      remoteAddress: opts.ip ?? nextIp(),
    });
  const refresh = (token: string) =>
    app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken: token }, remoteAddress: nextIp() });
  const authed = (method: 'GET' | 'POST' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as object, remoteAddress: nextIp() });

  /** The security emails queued for an address, by template. */
  async function mailsTo(email: string, template: string): Promise<number> {
    const jobs = await app.jobs!.raw.getJobs(['waiting', 'delayed', 'prioritized', 'completed', 'failed']);
    return jobs.filter(
      (j) => j.name === 'send-email' && (j.data as { to?: string }).to === email && (j.data as { template?: string }).template === template,
    ).length;
  }

  /** Fail `times` sign-ins from strangers (passing the CAPTCHA once it is asked for). */
  async function failFromStrangers(email: string, times: number): Promise<void> {
    for (let i = 0; i < times; i++) {
      const res = await login(email, 'wrong-password', { captchaToken: GOOD_CAPTCHA });
      expect(res.statusCode, res.body).toBe(401);
    }
  }

  beforeAll(async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url === TURNSTILE_URL) {
        const sent = new URLSearchParams(String(init?.body));
        return new Response(JSON.stringify({ success: sent.get('response') === GOOD_CAPTCHA }), { status: 200 });
      }
      if (url.startsWith(BREACH_RANGE_URL)) {
        if (corpusDown) throw new Error('corpus unreachable');
        const prefix = url.slice(BREACH_RANGE_URL.length);
        rangesAsked.push(prefix);
        const lines = [...breached].filter((h) => h.startsWith(prefix)).map((h) => `${h.slice(5)}:42`);
        lines.push(`${'0'.repeat(35)}:0`); // padding, as the corpus sends it
        return new Response(lines.join('\r\n'), { status: 200 });
      }
      throw new Error(`a test reached for the network: ${url}`);
    });
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    if (REDIS_URL) redis = new Redis(REDIS_URL);
  });

  // these tests fail sign-ins by the dozen, which is a surge in its own right:
  // each starts from a quiet minute
  let redis: Redis | null = null;
  beforeEach(async () => {
    if (!redis) return;
    const counters = await redis.keys('auth:login-*');
    if (counters.length > 0) await redis.del(...counters);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await redis?.del(SURGE_FLAG_KEY);
    await redis?.quit();
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${s}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('a known device signs in while strangers are held at the challenge', async () => {
    const device = `phone-${randomUUID()}`;
    const owner = await account('kdev', device);
    await failFromStrangers(owner.email, 5); // the account's lock for unknown clients

    const stranger = await login(owner.email, PASSWORD);
    expect(stranger.statusCode).toBe(403);
    expect(stranger.json()).toMatchObject({ code: 'CAPTCHA_REQUIRED', details: { captchaRequired: true, reason: 'attempts' } });

    // the owner's phone has its own budget: no lock, no challenge
    const phone = await login(owner.email, PASSWORD, { deviceId: device });
    expect(phone.statusCode, phone.body).toBe(200);
  });

  it('without a device id, the network the owner signed in from is what is known', async () => {
    const home = '198.51.100.24';
    const owner = await account('knet', undefined, home);
    await failFromStrangers(owner.email, 5); // locked for everyone else
    expect((await login(owner.email, PASSWORD)).json().code).toBe('CAPTCHA_REQUIRED');
    // at home, with no device id: its own budget, no lock, no challenge
    const atHome = await login(owner.email, PASSWORD, { ip: home });
    expect(atHome.statusCode, atHome.body).toBe(200);
    // and a new network is not worth an email; only a new device is
    if (REDIS_URL) expect(await mailsTo(owner.email, 'new-sign-in')).toBe(0);
  });

  it(`asks for the challenge after ${CAPTCHA_AFTER_FAILURES} failures; with it, the right password gets in even while locked`, async () => {
    const owner = await account('step');
    for (let i = 0; i < CAPTCHA_AFTER_FAILURES; i++) expect((await login(owner.email, 'wrong-password')).statusCode).toBe(401);

    const asked = await login(owner.email, 'wrong-password');
    expect(asked.statusCode).toBe(403);
    expect(asked.json()).toMatchObject({ code: 'CAPTCHA_REQUIRED', details: { captchaRequired: true, reason: 'attempts' } });
    expect((await login(owner.email, PASSWORD, { captchaToken: 'forged' })).json().code).toBe('CAPTCHA_REQUIRED');

    // two more wrong ones with the challenge passed: now the account is locked
    await failFromStrangers(owner.email, 2);
    expect(await new LockoutService(pool).lockedFor('account', owner.id)).toBeGreaterThan(0);

    const back = await login(owner.email, PASSWORD, { captchaToken: GOOD_CAPTCHA });
    expect(back.statusCode, back.body).toBe(200);
  });

  it('answers an address with no account exactly as one with an account', async () => {
    const owner = await account('alike');
    const ghost = `ghost_alike_${s}@it.kurda.app`;
    const answers = [];
    for (const email of [owner.email, ghost]) {
      for (let i = 0; i < CAPTCHA_AFTER_FAILURES; i++) {
        const res = await login(email, 'wrong-password');
        expect(res.statusCode).toBe(401);
        expect(res.json().code).toBe('INVALID_CREDENTIALS');
      }
      const res = await login(email, 'wrong-password');
      answers.push({ status: res.statusCode, code: res.json().code, message: res.json().message, details: res.json().details });
    }
    expect(answers[0]).toEqual(answers[1]);
  });

  it('takes as long to refuse at the challenge as to check a password', async () => {
    const held = await account('timing_a');
    for (let i = 0; i < CAPTCHA_AFTER_FAILURES; i++) await login(held.email, 'wrong-password');
    const median = async (run: () => Promise<unknown>) => {
      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        await run();
        times.push(performance.now() - t);
      }
      return times.sort((a, b) => a - b)[2]!;
    };
    const checked = await median(async () => {
      const fresh = `timing_b${randomUUID().slice(0, 6)}_${s}@it.kurda.app`;
      expect((await login(fresh, 'wrong-password')).statusCode).toBe(401);
    });
    const refused = await median(async () => {
      expect((await login(held.email, 'wrong-password')).statusCode).toBe(403);
    });
    // both spend one argon2 verification; without it the refusal took a few ms
    expect(refused).toBeGreaterThan(checked * 0.5);
  });

  it('never locks a busy shared network for one account, only asks it for the challenge (service-level)', async () => {
    const service = new AuthService(config, pool);
    const shared = '203.0.113.50';
    const a = await account('net_a');
    const b = await account('net_b');
    for (let i = 0; i < 25; i++) {
      await service
        .login({ email: (i % 2 ? a : b).email, password: 'wrong-password', ip: shared, captchaToken: GOOD_CAPTCHA })
        .catch(() => undefined);
    }
    expect(await new LockoutService(pool).lockedFor('ip', shared)).toBeNull();

    // someone else on the same network: asked to prove they are a person, then let in
    const c = await account('net_c');
    await expect(service.login({ email: c.email, password: PASSWORD, ip: shared })).rejects.toMatchObject({
      code: 'CAPTCHA_REQUIRED',
      details: { reason: 'network' },
    });
    const ok = await service.login({ email: c.email, password: PASSWORD, ip: shared, captchaToken: GOOD_CAPTCHA });
    expect(ok.user.id).toBe(c.id);
  });

  it.skipIf(!REDIS_URL)('a surge of failures everywhere asks every new device for the challenge', async () => {
    const device = `tablet-${randomUUID()}`;
    const owner = await account('surge', device);
    const surge = new LoginSurge(redis!);
    const now = new Date();
    for (let i = 0; i <= SURGE_FAILURES_PER_MINUTE; i++) await surge.recordFailure(now);
    expect(await surge.active()).toBe(true);
    try {
      const fresh = await login(owner.email, PASSWORD);
      expect(fresh.statusCode).toBe(403);
      expect(fresh.json().details.reason).toBe('surge');
      expect((await login(owner.email, PASSWORD, { captchaToken: GOOD_CAPTCHA })).statusCode).toBe(200);
      // the owner's own device is not a stranger
      expect((await login(owner.email, PASSWORD, { deviceId: device })).statusCode).toBe(200);
    } finally {
      await redis!.del(SURGE_FLAG_KEY);
    }
  });

  it.skipIf(!REDIS_URL)('tells the owner about a new device, but not about the first sign-in after sign-up', async () => {
    const owner = await account('newdev');
    expect((await login(owner.email, PASSWORD, { deviceId: `first-${randomUUID()}` })).statusCode).toBe(200);
    expect(await mailsTo(owner.email, 'new-sign-in')).toBe(0);

    const other = `second-${randomUUID()}`;
    expect((await login(owner.email, PASSWORD, { deviceId: other })).statusCode).toBe(200);
    expect(await mailsTo(owner.email, 'new-sign-in')).toBe(1);
    expect((await login(owner.email, PASSWORD, { deviceId: other })).statusCode).toBe(200);
    expect(await mailsTo(owner.email, 'new-sign-in')).toBe(1);
  });

  it.skipIf(!REDIS_URL)('tells the owner when their account is locked, once a day at most', async () => {
    const owner = await account('lockmail');
    await failFromStrangers(owner.email, 5);
    expect(await mailsTo(owner.email, 'sign-in-attempts')).toBe(1);
    // the lock runs out and a second one follows within the day: no second email
    await pool.query(`UPDATE auth_lockouts SET locked_until = now() - interval '1 minute' WHERE scope = 'account' AND key = $1`, [owner.id]);
    await failFromStrangers(owner.email, 5);
    expect(await mailsTo(owner.email, 'sign-in-attempts')).toBe(1);
  });

  it('caps reset emails per account, and answers every address the same', async () => {
    const owner = await account('resetcap');
    for (const email of [owner.email, `nobody_${s}@it.kurda.app`]) {
      const res = await app.inject({ method: 'POST', url: '/auth/request-password-reset', payload: { email, captchaToken: GOOD_CAPTCHA }, remoteAddress: nextIp() });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ sent: true });
    }
    const service = new AuthService(config, pool);
    for (let i = 0; i < RESET_EMAILS_PER_HOUR + 2; i++) await service.requestPasswordReset(owner.email);
    const tokens = await pool.query(`SELECT count(*)::int AS n FROM email_tokens WHERE user_id = $1 AND purpose = 'password_reset'`, [owner.id]);
    expect(tokens.rows[0].n).toBe(RESET_EMAILS_PER_HOUR);
  });

  it('a password reset lifts the lock on the account', async () => {
    const owner = await account('unlock');
    await failFromStrangers(owner.email, 5);
    const token = await createEmailToken(pool, owner.id, 'password_reset');
    const reset = await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token, password: 'a-new-strong-password2' }, remoteAddress: nextIp() });
    expect(reset.statusCode, reset.body).toBe(200);
    // no lock, no challenge: the mailbox proved who this is
    expect((await login(owner.email, 'a-new-strong-password2')).statusCode).toBe(200);
  });

  it('refuses a breached password at sign-up, reset and change; fails open when the corpus is down', async () => {
    const leaked = 'Leaked-password-2024';
    breached.add(sha1(leaked));
    rangesAsked.length = 0;
    const signUp = await register('breach', undefined, leaked);
    expect(signUp.statusCode).toBe(400);
    expect(signUp.json()).toMatchObject({ code: 'PASSWORD_BREACHED', details: { reason: 'breached' } });
    // only five characters of the hash were sent
    expect(rangesAsked).toEqual([sha1(leaked).slice(0, 5)]);

    corpusDown = true;
    try {
      expect((await register('breach_down')).statusCode).toBe(201);
    } finally {
      corpusDown = false;
    }

    const owner = await account('breach_owner');
    const token = await createEmailToken(pool, owner.id, 'password_reset');
    const refused = await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token, password: leaked }, remoteAddress: nextIp() });
    expect(refused.json().code).toBe('PASSWORD_BREACHED');
    // the link was not spent on a refused password
    const accepted = await app.inject({ method: 'POST', url: '/auth/reset-password', payload: { token, password: 'a-new-strong-password3' }, remoteAddress: nextIp() });
    expect(accepted.statusCode, accepted.body).toBe(200);

    const signedIn = await login(owner.email, 'a-new-strong-password3');
    const change = await authed('POST', '/me/password', signedIn.json().tokens.accessToken, {
      currentPassword: 'a-new-strong-password3',
      newPassword: leaked,
    });
    expect(change.json().code).toBe('PASSWORD_BREACHED');
  });

  it('changes the password while signed in: other sessions end, this one goes on', async () => {
    const owner = await account('change');
    const other = (await login(owner.email, PASSWORD)).json().tokens;

    const wrong = await authed('POST', '/me/password', owner.access, { currentPassword: 'not-it', newPassword: 'another-strong-pass4' });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().code).toBe('WRONG_PASSWORD');

    const changed = await authed('POST', '/me/password', owner.access, { currentPassword: PASSWORD, newPassword: 'another-strong-pass4' });
    expect(changed.statusCode, changed.body).toBe(200);
    expect(changed.json()).toMatchObject({ changed: true, accessExpiresInSeconds: expect.any(Number) });

    expect((await authed('GET', '/me', changed.json().accessToken)).statusCode).toBe(200);
    expect((await authed('GET', '/me', owner.access)).statusCode).toBe(401); // the old access token
    expect((await refresh(other.refreshToken)).statusCode).toBe(401); // the other session
    expect((await refresh(owner.refresh)).statusCode).toBe(200); // this one
    expect((await login(owner.email, PASSWORD)).statusCode).toBe(401);
    expect((await login(owner.email, 'another-strong-pass4')).statusCode).toBe(200);
    if (REDIS_URL) expect(await mailsTo(owner.email, 'password-changed')).toBe(1);
  });

  it('lists sessions without addresses, and ends every other one on request', async () => {
    const owner = await account('sessions');
    const other = (await login(owner.email, PASSWORD)).json().tokens;

    const listed = await authed('GET', '/me/sessions', owner.access);
    expect(listed.json().sessions).toHaveLength(2);
    for (const session of listed.json().sessions) {
      expect(Object.keys(session).sort()).toEqual(['current', 'deviceName', 'id', 'lastSeenAt', 'startedAt']);
    }

    const ended = await authed('DELETE', '/me/sessions?except=current', owner.access);
    expect(ended.json()).toEqual({ revoked: true, everywhere: false, sessionsEnded: 1 });
    expect((await authed('GET', '/me', other.accessToken)).statusCode).toBe(401);
    expect((await refresh(other.refreshToken)).statusCode).toBe(401);
    expect((await authed('GET', '/me', owner.access)).statusCode).toBe(200);
    expect((await refresh(owner.refresh)).statusCode).toBe(200);
  });

  it('closing an account takes its devices, networks, notices and locks with it; the export lists them without hashes', async () => {
    const device = `gdpr-${randomUUID()}`;
    const owner = await account('gdprsec', device);
    await failFromStrangers(owner.email, 5);
    await pool.query(
      `INSERT INTO network_sightings (user_id, net_hash, day) VALUES ($1, 'n1', current_date), ($1, 'n2', current_date)`,
      [owner.id],
    );
    const service = new GdprService(pool);

    const exported = await service.buildExport(owner.id);
    expect(exported.signInDevices).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'device' }), expect.objectContaining({ kind: 'network' })]),
    );
    // the two above, and whatever the sign-ins here were seen from
    const seen = exported.networksSeen as Array<{ networks_seen: number }>;
    expect(seen).toHaveLength(1);
    expect(seen[0]!.networks_seen).toBeGreaterThanOrEqual(2);
    expect(exported.securityEmails).toEqual([expect.objectContaining({ kind: 'sign-in-attempts' })]);
    expect(JSON.stringify(exported)).not.toMatch(/"(device_hash|net_hash|target_hash)"/);

    await pool.query(`UPDATE users SET deletion_requested_at = now() - interval '${DELETION_GRACE_DAYS + 1} days' WHERE id = $1`, [owner.id]);
    await service.anonymizeExpired();
    for (const [table, column] of [
      ['known_devices', 'user_id'],
      ['security_notices', 'user_id'],
      ['network_sightings', 'user_id'],
    ] as const) {
      const left = await pool.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [owner.id]);
      expect(left.rowCount, table).toBe(0);
    }
    expect((await pool.query(`SELECT 1 FROM auth_lockouts WHERE scope = 'account' AND key = $1`, [owner.id])).rowCount).toBe(0);
  });

  it('ends a session at its lifetime, however often it is refreshed', async () => {
    const owner = await account('lifetime');
    await pool.query(`UPDATE refresh_tokens SET session_started_at = now() - interval '80 days' WHERE user_id = $1`, [owner.id]);
    const refreshed = await refresh(owner.refresh);
    expect(refreshed.statusCode).toBe(200);
    const next = await pool.query<{ expires_at: Date }>(
      `SELECT expires_at FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL`,
      [owner.id],
    );
    // the new token lives to the session's end (ten days on), not thirty days from now
    const days = (new Date(next.rows[0]!.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(9);
    expect(days).toBeLessThan(11);

    await pool.query(`UPDATE refresh_tokens SET session_started_at = now() - interval '91 days' WHERE user_id = $1`, [owner.id]);
    const ended = await refresh(refreshed.json().refreshToken);
    expect(ended.statusCode).toBe(401);
    expect(ended.json().code).toBe('REFRESH_EXPIRED');
  });
});
