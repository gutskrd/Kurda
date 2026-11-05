/**
 * Refreshed shop items against real Postgres: the one-time notice, and that an
 * owner keeps the item — a purchase is final, and there is no way to hand one
 * back for currency.
 *
 * The items are made here and replaced by running migration 1751000161000 over
 * them, which is how production's owners got their rows.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { WalletService } from '../wallet/service.js';
import { activate } from '../test/activate.js';
import { canonicalPair } from '../friends/pair.js';

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATION = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations', '1751000161000_code-made-cosmetics.js');

describe.skipIf(!DATABASE_URL)('refreshed items are kept, never returned (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  const s = Date.now().toString(36);
  const BG = `bg-old-${s}`;
  const ICON = `icon-old-${s}`;
  const FRESH = `bg-fresh-${s}`;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  async function register(tag: string, ip: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `rfr_${tag}_${s}@it.kurda.app`,
        username: `rfr_${tag}_${s}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    ids[tag] = res.json().user.id;
    tokens[tag] = res.json().tokens.accessToken;
  }

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, who: string | null, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: who ? { authorization: `Bearer ${tokens[who]}` } : {},
      payload: payload as object,
      remoteAddress: '10.92.4.4',
    });

  const inventory = async (who: string) => {
    const res = await call('GET', '/me/inventory', who);
    expect(res.statusCode).toBe(200);
    return res.json() as { items: Array<Record<string, unknown> & { sku: string; assetUrl: string | null }>; refreshedItems: string[] };
  };
  const zer = async (who: string) => (await wallet.balances(ids[who]!)).zer;

  /** Friends straight in the table, as other suites do: the shop gifts friends only. */
  const befriend = async (a: string, b: string): Promise<void> => {
    const { lo, hi } = canonicalPair(ids[a]!, ids[b]!);
    await pool.query(
      `INSERT INTO friendships (user_lo, user_hi, status, requested_by, created_at, responded_at)
       VALUES ($1, $2, 'accepted', $3, now(), now()) ON CONFLICT (user_lo, user_hi) DO NOTHING`,
      [lo, hi, ids[a]],
    );
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);

    await register('buyer', '10.92.0.1');
    await register('given', '10.92.0.2');
    await register('other', '10.92.0.3');

    await pool.query(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock, asset_key, premium_only)
       VALUES ($1, 'Old background', 'background', 'zer', 300, true, true, true, 'backgrounds/background-07.webp', true),
              ($2, 'Old icon', 'icon', 'zer', 800, true, true, true, 'icons/accessoire-icon-07.png', true),
              ($3, 'Fresh background', 'background', 'zer', 100, true, true, true, 'backgrounds/made-01-hevalo.webp', false)`,
      [BG, ICON, FRESH],
    );
    await wallet.credit({ userId: ids.buyer!, currency: 'zer', amount: 3000, reason: 'admin_adjustment' });
    for (const sku of [BG, ICON, FRESH]) {
      const bought = await call('POST', '/shop/purchase', 'buyer', { sku, idempotencyKey: `rfr-${sku}` });
      expect(bought.statusCode).toBe(200);
    }
    expect((await call('PUT', '/me/cosmetics/background', 'buyer', { sku: BG })).statusCode).toBe(200);
    await befriend('buyer', 'given');
    const gifted = await call('POST', '/shop/gift', 'buyer', { sku: BG, toUserId: ids.given, idempotencyKey: `rfr-gift-${s}` });
    expect(gifted.statusCode).toBe(200);

    const migration = (await import(pathToFileURL(MIGRATION).href)) as { up(pgm: unknown): Promise<void> };
    await migration.up({ db: { query: (text: string, params?: unknown[]) => pool.query(text, params) } });
  });

  afterAll(async () => {
    await pool?.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [[BG, ICON, FRESH]]).catch(() => undefined);
    await pool?.end();
    await app?.close();
  });

  it('tells an owner which of their items were refreshed, with the new art and no price to give back', async () => {
    const inv = await inventory('buyer');
    expect(inv.refreshedItems).toEqual([BG, ICON].sort());
    const bg = inv.items.find((i) => i.sku === BG)!;
    // the new art, in the same mood as the file it pointed at
    expect(bg.assetUrl).toMatch(/^\/cosmetics\/backgrounds\/made-\d\d-[a-z-]+\.webp$/);
    // nothing in the inventory says what an item would fetch: nothing fetches anything
    for (const item of inv.items) expect(item).not.toHaveProperty('refund');
  });

  it('tells someone who was given one about the new art too', async () => {
    expect((await inventory('given')).refreshedItems).toEqual([BG]);
  });

  it('tells nobody who owns none of them', async () => {
    expect((await inventory('other')).refreshedItems).toEqual([]);
  });

  it('shows the notice once, and the items stay where they were', async () => {
    const seen = await call('POST', '/me/inventory/refreshed/seen', 'buyer');
    expect(seen.statusCode).toBe(200);
    expect(seen.json()).toEqual({ seen: 2 });
    const inv = await inventory('buyer');
    expect(inv.refreshedItems).toEqual([]);
    expect(inv.items.map((i) => i.sku)).toEqual(expect.arrayContaining([BG, ICON, FRESH]));
    // seeing it twice is harmless
    expect((await call('POST', '/me/inventory/refreshed/seen', 'buyer')).json()).toEqual({ seen: 0 });
  });

  it('has no return route: asking is a 404, and nothing moves', async () => {
    const before = await zer('buyer');
    for (const sku of [BG, ICON, FRESH]) {
      const res = await call('POST', `/shop/items/${sku}/return`, 'buyer');
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('NOT_FOUND');
    }
    // a present cannot be turned into currency either
    expect((await call('POST', `/shop/items/${BG}/return`, 'given')).statusCode).toBe(404);
    expect((await call('POST', `/shop/items/${BG}/return`, null)).statusCode).toBe(404);

    expect(await zer('buyer')).toBe(before);
    const refunds = await pool.query(`SELECT 1 FROM wallet_ledger WHERE user_id = ANY($1) AND reason = 'shop_return'`, [
      [ids.buyer, ids.given],
    ]);
    expect(refunds.rowCount).toBe(0);
    expect((await inventory('buyer')).items.map((i) => i.sku)).toEqual(expect.arrayContaining([BG, ICON, FRESH]));
    expect((await inventory('given')).items.map((i) => i.sku)).toContain(BG);
    const worn = await pool.query(`SELECT equipped_background_sku FROM users WHERE id = $1`, [ids.buyer]);
    expect(worn.rows[0].equipped_background_sku).toBe(BG);
    expect(await wallet.verifyConsistency(ids.buyer!, 'zer')).toBe(true);
  });

  it('keeps a withdrawn item out of the shop: not listed, not sold, not giftable', async () => {
    const shop = await call('GET', '/shop', 'other');
    expect((shop.json().items as { sku: string }[]).map((i) => i.sku)).not.toContain(BG);
    const buy = await call('POST', '/shop/purchase', 'other', { sku: BG, idempotencyKey: `rfr-other-${s}` });
    expect(buy.statusCode).toBe(409);
    expect(buy.json().code).toBe('ITEM_UNAVAILABLE');
    await befriend('buyer', 'other');
    const gift = await call('POST', '/shop/gift', 'buyer', { sku: BG, toUserId: ids.other, idempotencyKey: `rfr-gift2-${s}` });
    expect(gift.statusCode).toBe(409);
    expect(gift.json().code).toBe('ITEM_UNAVAILABLE');
  });
});
