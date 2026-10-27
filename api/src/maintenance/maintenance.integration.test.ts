/**
 * Taking Hevalo offline, against real Postgres: a superadmin turns it on with
 * a title, a message, a picture and a time it is back; everyone else is then
 * answered 503 with that notice, while the console, staff and keeping a
 * session stay open; a start set for later waits for it, an end that reopens
 * does, and both going offline and coming back are in the security log.
 *
 * The setting is one row every test file shares, so this file runs its app
 * three weeks ahead (`maintenanceClock`): only this app sees it on.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { memoryStorage } from '../test/media.js';

const DATABASE_URL = process.env.DATABASE_URL;
const HOUR = 3_600_000;

describe.skipIf(!DATABASE_URL)('taking Hevalo offline (integration)', { timeout: 30_000 }, () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  const storage = memoryStorage();
  let shift = 21 * 24 * HOUR;
  const now = (): Date => new Date(Date.now() + shift);
  const at = (hours: number): string => new Date(now().getTime() + hours * HOUR).toISOString();
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let n = 0;
  const ip = (): string => `10.206.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  let owner = { id: '', token: '' };
  let member = { id: '', token: '' };
  let picture = '';

  async function person(tag: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `off_${tag}_${suffix}@it.kurda.app`, username: `off_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip(),
    });
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  const call = (who: { token: string } | null, method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
    app.inject({ method, url, headers: who ? { authorization: `Bearer ${who.token}` } : {}, payload, remoteAddress: ip() });

  const offline = (fields: object) =>
    call(owner, 'PUT', '/admin/maintenance', { enabled: true, title: null, message: null, assetKey: null, startsAt: null, endsAt: null, reopenAtEnd: true, ...fields });

  async function upload(kind: 'icon' | 'background', width: number, height: number): Promise<string> {
    const bytes = await sharp({ create: { width, height, channels: 4, background: { r: Number(BigInt(Date.now()) % 250n), g: 120, b: 90, alpha: 1 } } })
      .png()
      .toBuffer();
    const res = await app.inject({
      method: 'POST',
      url: `/admin/shop/art/${kind}`,
      headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'image/png' },
      payload: bytes,
      remoteAddress: ip(),
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().key as string;
  }

  const events = (kind: string) =>
    pool.query<{ user_id: string }>(`SELECT user_id FROM security_events WHERE kind = $1 AND user_id = $2`, [kind, owner.id]).then((r) => r.rows);

  beforeAll(async () => {
    app = buildApp(config, { maintenanceClock: now });
    app.decorate('storage', storage);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    owner = await person('owner');
    member = await person('member');
    await pool.query(`UPDATE users SET roles = '{admin,superadmin}' WHERE id = $1`, [owner.id]);
    await pass2fa(app, owner.token, ip());
    picture = await upload('background', 1600, 900);
  });

  afterAll(async () => {
    await pool.query(
      `UPDATE maintenance SET enabled = false, title = NULL, message = NULL, asset_key = NULL, starts_at = NULL, ends_at = NULL, reopen_at_end = true, updated_by = NULL WHERE id = 1`,
    );
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`off_%_${suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('is open to begin with', async () => {
    expect((await call(null, 'GET', '/status')).json()).toEqual({ maintenance: null });
    expect((await call(member, 'GET', '/me')).statusCode).toBe(200);
  });

  it('answers everyone but staff and the console with the notice the superadmin wrote', async () => {
    const set = await offline({ title: 'Back soon', message: 'New lessons are on the way.\nSee you shortly.', assetKey: picture, endsAt: at(2) });
    expect(set.statusCode, set.body).toBe(200);
    expect(set.json()).toMatchObject({ phase: 'on', pictureUrl: storage.publicUrl(picture), settings: { title: 'Back soon', assetKey: picture } });

    const refused = await call(member, 'GET', '/me');
    expect(refused.statusCode).toBe(503);
    expect(refused.headers['cache-control']).toBe('no-store');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(30);
    expect(refused.json()).toMatchObject({
      code: 'MAINTENANCE',
      maintenance: { title: 'Back soon', message: 'New lessons are on the way.\nSee you shortly.', pictureUrl: storage.publicUrl(picture), backBy: expect.any(String) },
    });
    // signed out too, and a route that does not exist
    expect((await call(null, 'GET', '/dictionary/word-of-day')).statusCode).toBe(503);
    expect((await call(null, 'POST', '/auth/register', {})).statusCode).toBe(503);

    // what stays open: the status the apps ask, keeping a session, the console, and staff in the app
    expect((await call(null, 'GET', '/status')).json().maintenance.title).toBe('Back soon');
    expect((await call(null, 'POST', '/auth/refresh', { refreshToken: 'x' })).statusCode).not.toBe(503);
    expect((await call(null, 'GET', '/version')).statusCode).toBe(200);
    expect((await call(owner, 'GET', '/admin/maintenance')).statusCode).toBe(200);
    expect((await call(owner, 'GET', '/me')).statusCode).toBe(200);

    // the picture is held while the screen shows it
    const held = await pool.query(`SELECT confirmed_at IS NOT NULL AS held FROM media_uploads WHERE key = $1`, [picture]);
    expect(held.rows[0]).toEqual({ held: true });
    await vi.waitFor(async () => expect(await events('console.offline_on')).toHaveLength(1));
  });

  it('is for superadmins only to change, and checks what it is given', async () => {
    expect((await call(member, 'PUT', '/admin/maintenance', { enabled: false })).statusCode).not.toBe(200);
    const past = await offline({ endsAt: at(-1) });
    expect(past.statusCode).toBe(400);
    expect(past.json().code).toBe('INVALID_SCHEDULE');
    const square = await upload('icon', 512, 512);
    const wrong = await offline({ assetKey: square });
    expect(wrong.json().code).toBe('BAD_ART_KEY');
    const far = await offline({ startsAt: at(24 * 40) });
    expect(far.statusCode).toBe(400);
  });

  it('opens again when turned off, and keeps what was written for next time', async () => {
    const res = await call(owner, 'PUT', '/admin/maintenance', {
      enabled: false,
      title: 'Back soon',
      message: null,
      assetKey: picture,
      startsAt: null,
      endsAt: null,
      reopenAtEnd: true,
    });
    expect(res.json()).toMatchObject({ phase: 'off', settings: { title: 'Back soon' } });
    expect((await call(member, 'GET', '/me')).statusCode).toBe(200);
    expect((await call(null, 'GET', '/status')).json()).toEqual({ maintenance: null });
    await vi.waitFor(async () => expect(await events('console.offline_off')).toHaveLength(1));
  });

  it('waits for a start set for later, and reopens by itself at its end', async () => {
    const later = await offline({ startsAt: at(1), endsAt: at(3) });
    expect(later.json().phase).toBe('scheduled');
    expect((await call(member, 'GET', '/me')).statusCode).toBe(200);

    shift += 2 * HOUR;
    expect((await call(member, 'GET', '/me')).statusCode).toBe(503);

    shift += 2 * HOUR;
    expect((await call(member, 'GET', '/me')).statusCode).toBe(200);
    expect((await call(owner, 'GET', '/admin/maintenance')).json().phase).toBe('ended');

    // an end that is only said is shown, and does not reopen
    await offline({ endsAt: at(1), reopenAtEnd: false });
    shift += 2 * HOUR;
    const still = await call(member, 'GET', '/me');
    expect(still.statusCode).toBe(503);
    // a time already past is not promised to anyone
    expect(still.json().maintenance.backBy).toBeNull();
  });
});
