/** IAP redemption + refund (KUR-072) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { IapService } from './service.js';
import { StubReceiptVerifier } from './verifier.js';
import { WalletService } from '../wallet/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('iap (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let iap: IapService;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  const product = `gems_100_${suffix}`;
  let userId = '';
  const txn = (n: string): string => JSON.stringify({ transactionId: `txn_${n}_${suffix}`, environment: 'production' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    iap = new IapService(pool, wallet, new StubReceiptVerifier(), config);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `iap_${suffix}@it.kurda.app`,
        username: `iap_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: '10.72.0.1',
    });
    userId = res.json().user.id;
    await iap.createPack({ platform: 'apple', productId: product, gems: 100 });
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
    await pool.query(`DELETE FROM gem_packs WHERE product_id = $1`, [product]);
    await pool.end();
    await app.close();
  });

  it('validates a receipt and grants the pack Gems', async () => {
    const r = await iap.redeem(userId, 'apple', txn('a'), product);
    expect(r).toMatchObject({ granted: true, duplicate: false, gems: 100, balance: 100 });
    expect((await wallet.balances(userId)).gems).toBe(100);
  });

  it('rejects an unknown product and an invalid receipt', async () => {
    await expect(iap.redeem(userId, 'apple', txn('x'), 'nope')).rejects.toThrow(/unknown product/i);
    await expect(iap.redeem(userId, 'apple', 'garbage', product)).rejects.toThrow(/validation/i);
  });

  it('a duplicate transaction never grants twice (restore/retry safe)', async () => {
    const t = txn('dup');
    const first = await iap.redeem(userId, 'apple', t, product);
    const again = await iap.redeem(userId, 'apple', t, product);
    expect(first.duplicate).toBe(false);
    expect(again.duplicate).toBe(true);
    // charged once: 100 (test a) + 100 (this txn) = 200, not 300
    expect((await wallet.balances(userId)).gems).toBe(200);
  });

  it('refund claws back the Gems and is idempotent', async () => {
    const t = txn('refund');
    await iap.redeem(userId, 'apple', t, product); // +100 → 300
    const transactionId = JSON.parse(t).transactionId as string;

    const clawed = await iap.refund('apple', transactionId);
    expect(clawed).toEqual({ found: true, clawedBack: 100 });
    expect((await wallet.balances(userId)).gems).toBe(200);

    // second webhook delivery is a no-op
    expect(await iap.refund('apple', transactionId)).toEqual({ found: true, clawedBack: 0 });
    expect((await wallet.balances(userId)).gems).toBe(200);
  });

  it('refund never drives the balance negative (caps at what remains)', async () => {
    // fresh user with a single pack, most of it spent before the refund
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `iap2_${suffix}@it.kurda.app`,
        username: `iap2_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: '10.72.0.2',
    });
    const uid = reg.json().user.id as string;
    const t = JSON.stringify({ transactionId: `txn_spend_${suffix}`, environment: 'production' });
    await iap.redeem(uid, 'apple', t, product); // +100
    await wallet.debit({ userId: uid, currency: 'gems', amount: 70, reason: 'shop_purchase' }); // 30 left

    const clawed = await iap.refund('apple', `txn_spend_${suffix}`);
    expect(clawed.clawedBack).toBe(30); // only what was left
    expect((await wallet.balances(uid)).gems).toBe(0);
  });

  it('the refund webhook is guarded by the shared secret', async () => {
    // secret is unset in this config → endpoint disabled
    const res = await app.inject({
      method: 'POST',
      url: '/iap/webhooks/apple',
      payload: { transactionId: 'whatever' },
      remoteAddress: '10.72.0.3',
    });
    expect(res.statusCode).toBe(503);
  });
});
