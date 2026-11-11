/**
 * The shop's frames against real Postgres, through the routes the apps call:
 * the frames migration 1751000431000 put on sale are listed with their
 * pictures, bought with Zêr like any other piece, worn through the route a
 * season frame is worn through, and then sent with the wearer's profile — the
 * SKU and the picture to lay round the face. A frame that is not owned is
 * neither worn nor shown, and a season frame still has no picture: the apps
 * draw that one. A frame can be a present like anything else on sale, and the
 * friend who is given one wears it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { seasonFrameSku } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { WalletService } from '../wallet/service.js';
import { activate } from '../test/activate.js';
import { canonicalPair } from '../friends/pair.js';

const DATABASE_URL = process.env.DATABASE_URL;
/** The frames the catalogue sells (api/content/cosmetics.json), which the migration put in the shop. */
const CATALOGUE = (JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content', 'cosmetics.json'), 'utf8')) as { frames: Array<{ sku: string; assetKey: string }> }).frames;
const FRAME = 'frame-made-lale';
const FRAME_ART = '/cosmetics/frames/made-01-lale.png';

describe.skipIf(!DATABASE_URL)('frames bought in the shop (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  const s = Date.now().toString(36);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  async function register(tag: string, ip: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `frm_${tag}_${s}@it.kurda.app`, username: `frm_${tag}_${s}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true, birthYear: 1990, birthMonth: 6 },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    ids[tag] = res.json().user.id;
    tokens[tag] = res.json().tokens.accessToken;
  }

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, who: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${tokens[who]}` }, payload: payload as object, remoteAddress: '10.93.4.4' });
  const profile = async (viewer: string, of: string) => (await call('GET', `/users/${ids[of]}`, viewer)).json() as { frameSku: string | null; frameUrl: string | null };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    await register('buyer', '10.93.0.1');
    await register('other', '10.93.0.2');
    await wallet.credit({ userId: ids.buyer!, currency: 'zer', amount: 5000, reason: 'admin_adjustment' });
  });

  // (the two accounts stay, as other suites leave theirs: one has spent Zêr, and the wallet's ledger is never taken from)
  afterAll(async () => {
    await pool?.end();
    await app?.close();
  });

  it('lists every frame of the catalogue for sale, each with its picture and its price in Zêr, and no season frame among them', async () => {
    const res = await call('GET', '/shop', 'buyer');
    expect(res.statusCode).toBe(200);
    const frames = (res.json().items as Array<{ sku: string; category: string; currency: string; price: number; assetUrl: string | null; premiumOnly: boolean }>).filter((i) => i.category === 'frame');
    expect(frames.map((f) => f.sku).sort()).toEqual(CATALOGUE.map((f) => f.sku).sort());
    expect(frames.length).toBeGreaterThanOrEqual(21);
    for (const f of frames) {
      expect(f.currency).toBe('zer');
      expect(f.price).toBeGreaterThanOrEqual(1200);
      expect(f.premiumOnly).toBe(false);
      expect(f.assetUrl).toBe(`/cosmetics/${CATALOGUE.find((c) => c.sku === f.sku)!.assetKey}`);
      expect(f.assetUrl).toMatch(/^\/cosmetics\/frames\/made-\d\d-[a-z-]+\.png$/);
    }
  });

  it('is not worn before it is owned', async () => {
    const worn = await call('PUT', '/me/cosmetics/frame', 'buyer', { sku: FRAME });
    expect([worn.statusCode, worn.json().code]).toEqual([403, 'NO_ACCESS']);
    expect(await profile('other', 'buyer')).toMatchObject({ frameSku: null, frameUrl: null });
  });

  it('is bought with Zêr, worn, and sent with the profile as a SKU and a picture', async () => {
    const before = (await wallet.balances(ids.buyer!)).zer;
    const bought = await call('POST', '/shop/purchase', 'buyer', { sku: FRAME, idempotencyKey: `frm-${s}` });
    expect(bought.statusCode).toBe(200);
    expect((await wallet.balances(ids.buyer!)).zer).toBe(before - 1400);
    // in what they own, with its picture, for the tile
    const owned = ((await call('GET', '/me/inventory', 'buyer')).json().items as Array<{ sku: string; category: string; assetUrl: string | null }>).find((i) => i.sku === FRAME);
    expect(owned).toMatchObject({ category: 'frame', assetUrl: FRAME_ART });

    const worn = await call('PUT', '/me/cosmetics/frame', 'buyer', { sku: FRAME });
    expect([worn.statusCode, worn.json()]).toEqual([200, { frameSku: FRAME }]);
    // to anyone who may see the profile, and to themselves
    expect(await profile('other', 'buyer')).toMatchObject({ frameSku: FRAME, frameUrl: FRAME_ART });
    expect(await profile('buyer', 'buyer')).toMatchObject({ frameSku: FRAME, frameUrl: FRAME_ART });

    // taken off again
    expect((await call('PUT', '/me/cosmetics/frame', 'buyer', { sku: null })).statusCode).toBe(200);
    expect(await profile('other', 'buyer')).toMatchObject({ frameSku: null, frameUrl: null });
  });

  it('is one to a person: bought once', async () => {
    const again = await call('POST', '/shop/purchase', 'buyer', { sku: FRAME, idempotencyKey: `frm-again-${s}` });
    expect(again.statusCode).toBeGreaterThanOrEqual(400);
    const count = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM user_entitlements WHERE user_id = $1 AND sku = $2`, [ids.buyer, FRAME]);
    expect(count.rows[0]!.n).toBe(1);
  });

  it('sends a season frame as its SKU alone: the apps draw that one', async () => {
    const season = seasonFrameSku('gir');
    await pool.query(`INSERT INTO user_entitlements (user_id, sku) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ids.other, season]);
    expect((await call('PUT', '/me/cosmetics/frame', 'other', { sku: season })).statusCode).toBe(200);
    expect(await profile('buyer', 'other')).toMatchObject({ frameSku: season, frameUrl: null });
  });

  it('can be a present: the friend who is given one wears it', async () => {
    // friends straight in the table, as other suites do: the shop gifts friends only
    const { lo, hi } = canonicalPair(ids.buyer!, ids.other!);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, requested_by, created_at, responded_at)
       VALUES ($1, $2, 'accepted', $3, now(), now()) ON CONFLICT (user_lo, user_hi) DO NOTHING`,
      [lo, hi, ids.buyer],
    );
    const before = (await wallet.balances(ids.buyer!)).zer;
    const gifted = await call('POST', '/shop/gift', 'buyer', { sku: 'frame-made-genim', toUserId: ids.other, idempotencyKey: `frm-gift-${s}` });
    expect(gifted.statusCode).toBe(200);
    expect((await wallet.balances(ids.buyer!)).zer).toBe(before - 1200);
    // the giver paid for it and does not own it
    expect((await call('PUT', '/me/cosmetics/frame', 'buyer', { sku: 'frame-made-genim' })).statusCode).toBe(403);
    expect((await call('PUT', '/me/cosmetics/frame', 'other', { sku: 'frame-made-genim' })).statusCode).toBe(200);
    expect(await profile('buyer', 'other')).toMatchObject({ frameSku: 'frame-made-genim', frameUrl: '/cosmetics/frames/made-02-genim.png' });
  });
});
