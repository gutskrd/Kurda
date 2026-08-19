/** Shop catalog visibility + availability + cache (KUR-069) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ShopService } from './service.js';
import { WalletService } from '../wallet/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('shop catalog (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let shop: ShopService;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  const uniqueSku = `vis_unique_${suffix}`;
  const commonSku = `vis_common_${suffix}`;
  const limitedSku = `vis_limited_${suffix}`;
  let userId = '';
  let userToken = '';
  let adminToken = '';

  const reg = async (tag: string): Promise<{ id: string; token: string }> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `shopcat_${tag}_${suffix}@it.kurda.app`,
        username: `shopcat_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.69.0.1',
    });
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  };
  const catalogSkus = async (): Promise<string[]> => {
    const res = await app.inject({
      method: 'GET',
      url: '/shop',
      headers: { authorization: `Bearer ${userToken}` },
      remoteAddress: '10.69.0.2',
    });
    return (res.json().items as Array<{ sku: string }>).map((i) => i.sku);
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    shop = new ShopService(pool, wallet); // direct (no cache) for the window test
    const user = await reg('u');
    userId = user.id;
    userToken = user.token;
    const admin = await reg('admin');
    adminToken = admin.token;
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [admin.id]);

    for (const body of [
      { sku: uniqueSku, name: 'Gold Frame', category: 'cosmetic', currency: 'zer', price: 100, isUnique: true },
      { sku: commonSku, name: 'Streak Freeze', category: 'freeze', currency: 'zer', price: 10, isUnique: false },
    ]) {
      await app.inject({
        method: 'POST',
        url: '/shop/items',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: body,
        remoteAddress: '10.69.0.3',
      });
    }
    await wallet.credit({ userId, currency: 'zer', amount: 500, reason: 'admin_adjustment' });
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM shop_items WHERE sku LIKE '%_${suffix}'`);
    await pool.end();
    await app.close();
  });

  it('GET /shop shows active items and hides already-owned unique items', async () => {
    expect(await catalogSkus()).toEqual(expect.arrayContaining([uniqueSku, commonSku]));

    // buy the unique item → it should disappear from the catalog
    await shop.purchase(userId, uniqueSku, `buy-${suffix}`);
    const after = await catalogSkus();
    expect(after).not.toContain(uniqueSku);
    // the non-unique item stays visible
    expect(after).toContain(commonSku);
  });

  it('pulling an item out of stock removes it (cache invalidated on edit)', async () => {
    expect(await catalogSkus()).toContain(commonSku);
    const res = await app.inject({
      method: 'PATCH',
      url: `/shop/items/${commonSku}/stock`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { inStock: false },
      remoteAddress: '10.69.0.4',
    });
    expect(res.statusCode).toBe(200);
    expect(await catalogSkus()).not.toContain(commonSku);
  });

  it('rejects a purchase whose displayed price no longer matches (KUR-070)', async () => {
    const sku = `priced_${suffix}`;
    await shop.createItem({ sku, name: 'Priced', category: 'powerup', currency: 'zer', price: 30, isUnique: false });
    // the client thinks it costs 20, but it's 30 now → PRICE_CHANGED, no debit
    await expect(shop.purchase(userId, sku, `pc-${suffix}`, new Date(), 20)).rejects.toThrow(/price changed/i);
    // the correct price goes through
    const ok = await shop.purchase(userId, sku, `pc2-${suffix}`, new Date(), 30);
    expect(ok.purchased).toBe(true);
  });

  it('a limited-time item disappears exactly at its window end', async () => {
    const windowEnd = new Date('2026-06-01T00:00:00Z');
    await shop.createItem({
      sku: limitedSku,
      name: 'Newroz Special',
      category: 'cosmetic',
      currency: 'zer',
      price: 25,
      isUnique: false,
      availableTo: windowEnd,
    });
    const before = new Date(windowEnd.getTime() - 1000);
    const after = new Date(windowEnd.getTime() + 1000);
    expect((await shop.catalog(userId, before)).map((i) => i.sku)).toContain(limitedSku);
    expect((await shop.catalog(userId, after)).map((i) => i.sku)).not.toContain(limitedSku);
  });
});
