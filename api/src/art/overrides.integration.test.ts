/**
 * Pictures put in place of the built-in art, against real Postgres: an
 * uploaded picture given to a slot shows in the public list the apps load, a
 * level's own picture and the one for every level both, a reset brings the
 * original back and lets the old picture go, the history keeps both, and only
 * the admins who keep the art can change it. Any shop item can carry a square
 * picture too.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { BADGES } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { memoryStorage } from '../test/media.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('pictures put in place of the built-in art (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  const storage = memoryStorage();
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let n = 0;
  const ip = (): string => `10.208.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  let admin = { id: '', token: '' };
  let member = { id: '', token: '' };
  const badge = BADGES.find((b) => b.tiers.length > 1)!.key;

  let hue = Number(BigInt(Date.now()) % 200n);
  async function picture(width: number, height: number): Promise<Buffer> {
    hue = (hue + 11) % 250;
    return sharp({ create: { width, height, channels: 4, background: { r: hue, g: 90, b: 200 - (hue % 100), alpha: 1 } } }).png().toBuffer();
  }

  async function person(tag: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `art_${tag}_${suffix}@it.kurda.app`, username: `art_${tag}_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip(),
    });
    await activate(app, pool, res);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  const call = (who: { token: string } | null, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: object) =>
    app.inject({ method, url, headers: who ? { authorization: `Bearer ${who.token}` } : {}, payload, remoteAddress: ip() });

  async function upload(kind: 'icon' | 'background', bytes: Buffer): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/shop/art/${kind}`,
      headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'image/png' },
      payload: bytes,
      remoteAddress: ip(),
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json().key as string;
  }

  const published = async () => (await call(null, 'GET', '/art/overrides')).json() as { version: string; overrides: Record<string, string> };
  const confirmed = async (key: string) =>
    (await pool.query<{ confirmed: boolean }>(`SELECT confirmed_at IS NOT NULL AS confirmed FROM media_uploads WHERE key = $1`, [key])).rows[0]?.confirmed;

  beforeAll(async () => {
    app = buildApp(config);
    app.decorate('storage', storage);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    admin = await person('admin');
    member = await person('member');
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [admin.id]);
    await pass2fa(app, admin.token, ip());
  });

  afterAll(async () => {
    for (const slot of [`badge:${badge}`, `badge:${badge}:zer`, 'rank:zozan', 'event:newroz']) {
      await pool.query(`DELETE FROM art_overrides WHERE slot = $1`, [slot]);
    }
    await pool.query(`DELETE FROM shop_items WHERE sku = $1`, [`art_freeze_${suffix}`]);
    await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`art_%_${suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('shows a slot’s new picture to everyone, a level’s own over the one for every level', async () => {
    const all = await upload('icon', await picture(512, 512));
    const gold = await upload('icon', await picture(512, 512));
    const before = await published();
    expect((await call(admin, 'PUT', `/admin/art/badge:${badge}`, { assetKey: all, note: 'new look' })).statusCode).toBe(200);
    expect((await call(admin, 'PUT', `/admin/art/badge:${badge}:zer`, { assetKey: gold })).statusCode).toBe(200);
    const after = await published();
    expect(after.version).not.toBe(before.version);
    expect(after.overrides[`badge:${badge}`]).toBe(storage.publicUrl(all));
    expect(after.overrides[`badge:${badge}:zer`]).toBe(storage.publicUrl(gold));
    // held for as long as the slot uses it
    expect(await confirmed(all)).toBe(true);
    // the list is public, and briefly cacheable for anyone not signed in
    const anonymous = await call(null, 'GET', '/art/overrides');
    expect(anonymous.headers['cache-control']).toContain('public');
  });

  it('puts the original back, lets the old picture go, and keeps both in the history', async () => {
    const key = await upload('icon', await picture(512, 512));
    await call(admin, 'PUT', '/admin/art/rank:zozan', { assetKey: key });
    expect((await published()).overrides['rank:zozan']).toBeDefined();
    const reset = await call(admin, 'DELETE', '/admin/art/rank:zozan', { note: 'back to the original' });
    expect(reset.statusCode).toBe(200);
    expect((await published()).overrides['rank:zozan']).toBeUndefined();
    // the sweep takes it a day from now: the day to change one's mind in
    expect(await confirmed(key)).toBe(false);
    const history = (await call(admin, 'GET', '/admin/art/rank:zozan/history')).json().history as Array<{ assetKey: string | null; note: string | null }>;
    expect(history[0]).toMatchObject({ assetKey: null, note: 'back to the original' });
    expect(history[1]!.assetKey).toBe(key);
    // and putting it back within the day works
    expect((await call(admin, 'PUT', '/admin/art/rank:zozan', { assetKey: key })).statusCode).toBe(200);
    expect(await confirmed(key)).toBe(true);
  });

  it('takes a banner’s 16:9 picture for an event, and refuses the wrong shape or an unknown slot', async () => {
    const square = await upload('icon', await picture(512, 512));
    const wide = await upload('background', await picture(1280, 720));
    const wrong = await call(admin, 'PUT', '/admin/art/event:newroz', { assetKey: square });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().code).toBe('BAD_ART_KEY');
    expect((await call(admin, 'PUT', '/admin/art/event:newroz', { assetKey: wide })).statusCode).toBe(200);
    expect((await call(admin, 'PUT', '/admin/art/badge:no-such-badge', { assetKey: square })).statusCode).toBe(400);
    expect((await call(admin, 'PUT', '/admin/art/rank:zozan', { assetKey: `cosmetic/icon/${'0'.repeat(64)}.png` })).json().code).toBe('ART_MISSING');
  });

  it('is changed only by the admins who keep the art, and the change is in the audit trail', async () => {
    const key = await upload('icon', await picture(512, 512));
    expect((await call(member, 'PUT', '/admin/art/rank:zozan', { assetKey: key })).statusCode).toBe(404);
    expect((await call(null, 'PUT', '/admin/art/rank:zozan', { assetKey: key })).statusCode).toBe(401);
    await call(admin, 'PUT', `/admin/art/badge:${badge}`, { assetKey: key });
    const trail = await pool.query(`SELECT target_type FROM admin_audit_log WHERE admin_id = $1 AND target_id = $2`, [admin.id, `badge:${badge}`]);
    expect(trail.rows.length).toBeGreaterThan(0);
    expect(trail.rows[0]!.target_type).toBe('picture');
  });

  it('lets any shop item carry a square picture, shown in the shop', async () => {
    const key = await upload('icon', await picture(512, 512));
    const made = await call(admin, 'POST', '/admin/shop/items', {
      sku: `art_freeze_${suffix}`,
      name: 'A freeze with a picture',
      category: 'freeze',
      currency: 'zer',
      price: 10,
      assetKey: key,
    });
    expect(made.statusCode, made.body).toBeLessThan(300);
    const shop = await call(member, 'GET', '/shop');
    const items = (shop.json().items ?? shop.json()) as Array<{ sku: string; assetUrl: string | null }>;
    expect(items.find((i) => i.sku === `art_freeze_${suffix}`)?.assetUrl).toBe(storage.publicUrl(key));
  });
});
