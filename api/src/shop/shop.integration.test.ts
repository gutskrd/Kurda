/** Shop purchase flow (KUR-071) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ShopService } from './service.js';
import { InsufficientFundsError, WalletService } from '../wallet/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('shop (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let shop: ShopService;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  const frame = `frame_${suffix}`;
  const potion = `potion_${suffix}`;
  let userId = '';
  let token = '';

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    shop = new ShopService(pool, wallet);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `shop_${suffix}@it.kurda.app`,
        username: `shop_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.71.0.1',
    });
    userId = res.json().user.id;
    token = res.json().tokens.accessToken;

    await shop.createItem({ sku: frame, name: 'Gold Frame', currency: 'zer', price: 100, isUnique: true });
    await shop.createItem({ sku: potion, name: 'XP Potion', currency: 'zer', price: 20, isUnique: false });
    await wallet.credit({ userId, currency: 'zer', amount: 300, reason: 'admin_adjustment' });
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

  it('validates → debits → grants in one shot', async () => {
    const res = await shop.purchase(userId, frame, `buy-frame-${suffix}`);
    expect(res).toMatchObject({ purchased: true, duplicate: false, sku: frame, balance: 200 });
    expect((await wallet.balances(userId)).zer).toBe(200);
    const inv = await shop.inventory(userId);
    expect(inv.find((i) => i.sku === frame)).toBeTruthy();
  });

  it('retries with the same idempotency key never double-charge', async () => {
    const key = `buy-potion-${suffix}`;
    const first = await shop.purchase(userId, potion, key);
    const retry = await shop.purchase(userId, potion, key);
    expect(first.duplicate).toBe(false);
    expect(retry.duplicate).toBe(true);
    // charged exactly once (200 → 180), quantity stayed 1
    expect((await wallet.balances(userId)).zer).toBe(180);
    const inv = await shop.inventory(userId);
    expect(inv.find((i) => i.sku === potion)!.quantity).toBe(1);
  });

  it('rejects duplicate ownership of a unique item before any debit', async () => {
    const before = (await wallet.balances(userId)).zer;
    await expect(shop.purchase(userId, frame, `buy-frame-again-${suffix}`)).rejects.toThrow(/already own/i);
    expect((await wallet.balances(userId)).zer).toBe(before); // untouched
  });

  it('a failed debit grants nothing (insufficient funds rolls back)', async () => {
    const pricey = `pricey_${suffix}`;
    await shop.createItem({ sku: pricey, name: 'Costly', currency: 'zer', price: 1_000_000, isUnique: true });
    await expect(shop.purchase(userId, pricey, `buy-pricey-${suffix}`)).rejects.toBeInstanceOf(
      InsufficientFundsError,
    );
    const inv = await shop.inventory(userId);
    expect(inv.find((i) => i.sku === pricey)).toBeUndefined();
  });

  it('two concurrent buys with the same key charge only once', async () => {
    const stackable = `stack_${suffix}`;
    await shop.createItem({ sku: stackable, name: 'Stackable', currency: 'zer', price: 20, isUnique: false });
    const before = (await wallet.balances(userId)).zer;
    const key = `buy-stack-${suffix}`;

    const [a, b] = await Promise.all([
      shop.purchase(userId, stackable, key),
      shop.purchase(userId, stackable, key),
    ]);
    // exactly one did the real work; the other saw the idempotent duplicate
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    expect((await wallet.balances(userId)).zer).toBe(before - 20);
  });

  it('HTTP: item creation is admin-only; catalog + purchase work for users', async () => {
    const denied = await app.inject({
      method: 'POST',
      url: '/shop/items',
      headers: { authorization: `Bearer ${token}` },
      payload: { sku: `x_${suffix}`, name: 'X', currency: 'zer', price: 5 },
      remoteAddress: '10.71.0.2',
    });
    expect(denied.statusCode).toBe(403);

    const catalog = await app.inject({
      method: 'GET',
      url: '/shop',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.71.0.3',
    });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().items.length).toBeGreaterThanOrEqual(2);

    const inv = await app.inject({
      method: 'GET',
      url: '/me/inventory',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.71.0.4',
    });
    expect(inv.statusCode).toBe(200);
    expect(inv.json().items.length).toBeGreaterThanOrEqual(2);
  });
});
