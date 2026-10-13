/**
 * Refreshed shop items against real Postgres: the one-time notice, and handing
 * a replaced item back for what was paid — once, with the item leaving the
 * inventory and the profile in the same breath.
 *
 * The items are made here and replaced by running migration 1751000161000 over
 * them, which is how production's owners get their rows.
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

describe.skipIf(!DATABASE_URL)('returning a refreshed item (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  const s = Date.now().toString(36);
  const BG = `bg-old-${s}`;
  const ICON = `icon-old-${s}`;
  const FRESH = `bg-fresh-${s}`;
  /** the victim's two, and the cheapest thing in the shop */
  const PRIZE = `bg-prize-${s}`;
  const HELD = `bg-held-${s}`;
  const TRINKET = `misc-trinket-${s}`;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  async function register(tag: string, ip: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `ret_${tag}_${s}@it.kurda.app`,
        username: `ret_${tag}_${s}`.slice(0, 30),
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

  interface InventoryItem {
    sku: string;
    assetUrl: string | null;
    refund: { amount: number; currency: string } | null;
  }
  const inventory = async (who: string) => {
    const res = await call('GET', '/me/inventory', who);
    expect(res.statusCode).toBe(200);
    return res.json() as { items: InventoryItem[]; refreshedItems: string[] };
  };
  const zer = async (who: string) => (await wallet.balances(ids[who]!)).zer;
  const returnsIn = async (who: string, sku: string) =>
    (
      await pool.query<{ amount: number }>(
        `SELECT amount FROM wallet_ledger WHERE user_id = $1 AND reason = 'shop_return' AND ref_id = $2`,
        [ids[who], sku],
      )
    ).rows;

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
    await register('victim', '10.92.0.5');
    await register('thief', '10.92.0.6');

    await pool.query(
      `INSERT INTO shop_items (sku, name, category, currency, price, is_unique, active, in_stock, asset_key, premium_only)
       VALUES ($1, 'Old background', 'background', 'zer', 300, true, true, true, 'backgrounds/background-07.webp', true),
              ($2, 'Old icon', 'icon', 'zer', 800, true, true, true, 'icons/accessoire-icon-07.png', true),
              ($3, 'Fresh background', 'background', 'zer', 100, true, true, true, 'backgrounds/made-01-hevalo.webp', false),
              ($4, 'Old prize', 'background', 'zer', 500, true, true, true, 'backgrounds/background-12.webp', true),
              ($5, 'Old keepsake', 'background', 'zer', 500, true, true, true, 'backgrounds/background-13.webp', true),
              ($6, 'Trinket', 'misc', 'zer', 1, false, true, true, NULL, false)`,
      [BG, ICON, FRESH, PRIZE, HELD, TRINKET],
    );
    await wallet.credit({ userId: ids.buyer!, currency: 'zer', amount: 3000, reason: 'admin_adjustment' });
    for (const sku of [BG, ICON, FRESH]) {
      const bought = await call('POST', '/shop/purchase', 'buyer', { sku, idempotencyKey: `ret-${sku}` });
      expect(bought.statusCode).toBe(200);
    }
    await wallet.credit({ userId: ids.victim!, currency: 'zer', amount: 1000, reason: 'admin_adjustment' });
    for (const sku of [PRIZE, HELD]) {
      const bought = await call('POST', '/shop/purchase', 'victim', { sku, idempotencyKey: `ret-${sku}` });
      expect(bought.statusCode).toBe(200);
    }
    await wallet.credit({ userId: ids.thief!, currency: 'zer', amount: 10, reason: 'admin_adjustment' });
    expect((await call('PUT', '/me/cosmetics/background', 'buyer', { sku: BG })).statusCode).toBe(200);
    expect((await call('PUT', '/me/cosmetics/icon', 'buyer', { sku: ICON })).statusCode).toBe(200);
    await befriend('buyer', 'given');
    const gifted = await call('POST', '/shop/gift', 'buyer', { sku: BG, toUserId: ids.given, idempotencyKey: `ret-gift-${s}` });
    expect(gifted.statusCode).toBe(200);

    const migration = (await import(pathToFileURL(MIGRATION).href)) as { up(pgm: unknown): Promise<void> };
    await migration.up({ db: { query: (text: string, params?: unknown[]) => pool.query(text, params) } });
  });

  afterAll(async () => {
    await pool?.query(`DELETE FROM shop_items WHERE sku = ANY($1)`, [[BG, ICON, FRESH, PRIZE, HELD, TRINKET]]).catch(() => undefined);
    await pool?.end();
    await app?.close();
  });

  it('tells an owner which of their items were refreshed, and what returning each gives back', async () => {
    const inv = await inventory('buyer');
    expect(inv.refreshedItems).toEqual([BG, ICON].sort());
    const bg = inv.items.find((i) => i.sku === BG)!;
    expect(bg.refund).toEqual({ amount: 300, currency: 'zer' });
    // the new art, in the same mood as the file it pointed at
    expect(bg.assetUrl).toMatch(/^\/cosmetics\/backgrounds\/made-\d\d-[a-z-]+\.webp$/);
    expect(inv.items.find((i) => i.sku === ICON)!.refund).toEqual({ amount: 800, currency: 'zer' });
    expect(inv.items.find((i) => i.sku === FRESH)!.refund).toBeNull();
  });

  it('tells someone who was given one about the new art, but offers nothing back for a present', async () => {
    const inv = await inventory('given');
    expect(inv.refreshedItems).toEqual([BG]);
    expect(inv.items.find((i) => i.sku === BG)!.refund).toBeNull();
  });

  it('tells nobody who owns none of them', async () => {
    expect((await inventory('other')).refreshedItems).toEqual([]);
  });

  it('shows the notice once: after it is seen it is not listed, and returning is still possible', async () => {
    const seen = await call('POST', '/me/inventory/refreshed/seen', 'buyer');
    expect(seen.statusCode).toBe(200);
    expect(seen.json()).toEqual({ seen: 2 });
    const inv = await inventory('buyer');
    expect(inv.refreshedItems).toEqual([]);
    expect(inv.items.find((i) => i.sku === BG)!.refund).toEqual({ amount: 300, currency: 'zer' });
    // seeing it twice is harmless
    expect((await call('POST', '/me/inventory/refreshed/seen', 'buyer')).json()).toEqual({ seen: 0 });
  });

  it('keeps a withdrawn item out of the shop: not listed, not sold, not giftable', async () => {
    const shop = await call('GET', '/shop', 'other');
    expect((shop.json().items as { sku: string }[]).map((i) => i.sku)).not.toContain(BG);
    const buy = await call('POST', '/shop/purchase', 'other', { sku: BG, idempotencyKey: `ret-other-${s}` });
    expect(buy.statusCode).toBe(409);
    expect(buy.json().code).toBe('ITEM_UNAVAILABLE');
    await befriend('buyer', 'other');
    const gift = await call('POST', '/shop/gift', 'buyer', { sku: BG, toUserId: ids.other, idempotencyKey: `ret-gift2-${s}` });
    expect(gift.statusCode).toBe(409);
    expect(gift.json().code).toBe('ITEM_UNAVAILABLE');
  });

  it('refunds what was paid, removes the item and takes it off the profile', async () => {
    const before = await zer('buyer');
    const res = await call('POST', `/shop/items/${BG}/return`, 'buyer');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ returned: true, duplicate: false, sku: BG, refund: { amount: 300, currency: 'zer' }, balance: before + 300 });
    expect(await zer('buyer')).toBe(before + 300);
    expect(await returnsIn('buyer', BG)).toEqual([{ amount: 300 }]);
    expect(await wallet.verifyConsistency(ids.buyer!, 'zer')).toBe(true);

    const inv = await inventory('buyer');
    expect(inv.items.map((i) => i.sku)).not.toContain(BG);
    const worn = await pool.query(`SELECT equipped_background_sku, equipped_icon_sku FROM users WHERE id = $1`, [ids.buyer]);
    expect(worn.rows[0]).toEqual({ equipped_background_sku: null, equipped_icon_sku: ICON });
  });

  it('pays once: a repeat answers again and pays nothing', async () => {
    const before = await zer('buyer');
    const again = await call('POST', `/shop/items/${BG}/return`, 'buyer');
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ returned: true, duplicate: true, refund: { amount: 300 }, balance: before });
    expect(await zer('buyer')).toBe(before);
    expect(await returnsIn('buyer', BG)).toHaveLength(1);
  });

  it('pays once when two returns arrive together', async () => {
    const before = await zer('buyer');
    const [a, b] = await Promise.all([
      call('POST', `/shop/items/${ICON}/return`, 'buyer'),
      call('POST', `/shop/items/${ICON}/return`, 'buyer'),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect([a.json().duplicate, b.json().duplicate].sort()).toEqual([false, true]);
    expect(await zer('buyer')).toBe(before + 800);
    expect(await returnsIn('buyer', ICON)).toEqual([{ amount: 800 }]);
    const worn = await pool.query(`SELECT equipped_icon_sku FROM users WHERE id = $1`, [ids.buyer]);
    expect(worn.rows[0].equipped_icon_sku).toBeNull();
  });

  it('gives nothing for a present, and the present stays', async () => {
    const res = await call('POST', `/shop/items/${BG}/return`, 'given');
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('NOTHING_TO_REFUND');
    expect((await inventory('given')).items.map((i) => i.sku)).toContain(BG);
  });

  it('pays the owner even when someone else bought with the key a return used to be paid under', async () => {
    // that key was guessable — the owner's id, which profiles show, and the
    // item — and ledger keys are unique across everyone; a client's key is now
    // filed under its sender, and the refund's is the server's own
    const taken = await call('POST', '/shop/purchase', 'thief', {
      sku: TRINKET,
      idempotencyKey: `shop-return:${ids.victim}:${PRIZE}`,
    });
    expect(taken.statusCode).toBe(200);
    const filed = await pool.query<{ idempotency_key: string }>(
      `SELECT idempotency_key FROM wallet_ledger WHERE user_id = $1 AND reason = 'shop_purchase'`,
      [ids.thief],
    );
    expect(filed.rows.map((r) => r.idempotency_key)).toEqual([`purchase:${ids.thief}:shop-return:${ids.victim}:${PRIZE}`]);

    const before = await zer('victim');
    const res = await call('POST', `/shop/items/${PRIZE}/return`, 'victim');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      returned: true,
      duplicate: false,
      sku: PRIZE,
      refund: { amount: 500, currency: 'zer' },
      balance: before + 500,
    });
    expect(await zer('victim')).toBe(before + 500);
    expect(await returnsIn('victim', PRIZE)).toEqual([{ amount: 500 }]);
    expect((await inventory('victim')).items.map((i) => i.sku)).not.toContain(PRIZE);
  });

  it('keeps the item, and the balance, when the refund cannot be paid', async () => {
    // The refund's key is made from the owner's record, which no answer shows.
    // Were it taken all the same, the credit would pay nothing: the return
    // must then not go ahead.
    const rec = await pool.query<{ id: string }>(
      `SELECT id FROM cosmetic_refreshes WHERE user_id = $1 AND sku = $2`,
      [ids.victim, HELD],
    );
    await wallet.credit({
      userId: ids.other!,
      currency: 'zer',
      amount: 1,
      reason: 'admin_adjustment',
      idempotencyKey: `shop-return:${rec.rows[0]!.id}`,
    });

    const before = await zer('victim');
    const res = await call('POST', `/shop/items/${HELD}/return`, 'victim');
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('RETURN_CONFLICT');
    expect(await zer('victim')).toBe(before);
    expect(await returnsIn('victim', HELD)).toEqual([]);
    const held = (await inventory('victim')).items.find((i) => i.sku === HELD);
    expect(held?.refund).toEqual({ amount: 500, currency: 'zer' });
    const row = await pool.query(`SELECT returned_at FROM cosmetic_refreshes WHERE user_id = $1 AND sku = $2`, [ids.victim, HELD]);
    expect(row.rows[0].returned_at).toBeNull();
  });

  it('returns only a replaced item, only to its owner, and says when an item does not exist', async () => {
    const fresh = await call('POST', `/shop/items/${FRESH}/return`, 'buyer');
    expect(fresh.statusCode).toBe(409);
    expect(fresh.json().code).toBe('NOT_RETURNABLE');
    const notTheirs = await call('POST', `/shop/items/${ICON}/return`, 'other');
    expect(notTheirs.statusCode).toBe(409);
    expect(notTheirs.json().code).toBe('NOT_RETURNABLE');
    const missing = await call('POST', `/shop/items/no-such-${s}/return`, 'buyer');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe('ITEM_NOT_FOUND');
    expect((await call('POST', `/shop/items/${ICON}/return`, null)).statusCode).toBe(401);
  });
});
