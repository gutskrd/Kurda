/** Payment fraud detection (KUR-073) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { IapService } from '../iap/service.js';
import { StubReceiptVerifier } from '../iap/verifier.js';
import { WalletService } from '../wallet/service.js';
import { FraudService } from './service.js';
import { VELOCITY_MAX_PER_HOUR } from './rules.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('payment fraud (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let iap: IapService;
  let fraud: FraudService;
  let wallet: WalletService;
  const suffix = Date.now().toString(36);
  const product = `gems_fraud_${suffix}`;
  const ids: string[] = [];

  const register = async (tag: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `fraud_${tag}_${suffix}@it.kurda.app`,
        username: `fraud_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.73.0.1',
    });
    return res.json().user.id as string;
  };
  const receipt = (n: string, ownershipType?: string): string =>
    JSON.stringify({ transactionId: `ftxn_${n}_${suffix}`, environment: 'production', ownershipType });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    fraud = new FraudService(pool, wallet);
    iap = new IapService(pool, wallet, new StubReceiptVerifier(), config, fraud);
    await iap.createPack({ platform: 'apple', productId: product, gems: 100 });
    ids.push(await register('v'), await register('a'), await register('b'), await register('fam'));
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

  it('holds purchases past the velocity cap, then an admin clear grants them', async () => {
    const user = ids[0]!;
    // the first N are under the cap and grant normally
    for (let i = 0; i < VELOCITY_MAX_PER_HOUR; i++) {
      const r = await iap.redeem(user, 'apple', receipt(`v${i}`), product);
      expect(r.granted).toBe(true);
    }
    expect((await wallet.balances(user)).gems).toBe(100 * VELOCITY_MAX_PER_HOUR);

    // the next one trips VELOCITY → held, not granted
    const held = await iap.redeem(user, 'apple', receipt('vX'), product);
    expect(held).toMatchObject({ granted: false, held: true });
    expect((await wallet.balances(user)).gems).toBe(100 * VELOCITY_MAX_PER_HOUR);

    const queue = await fraud.pendingReviews();
    const review = queue.find((r) => r.userId === user)!;
    expect(review.flags).toContain('VELOCITY');
    expect(review.receiptId).toBeTruthy();

    // admin clears → the held Gems are granted and the hold is released
    const admin = ids[1]!;
    const res = await fraud.resolve(review.id, 'clear', admin);
    expect(res).toEqual({ status: 'cleared', grantedGems: 100 });
    expect((await wallet.balances(user)).gems).toBe(100 * (VELOCITY_MAX_PER_HOUR + 1));
    expect(await fraud.pendingReviews()).toHaveLength(0);
  });

  it('flags receipt reuse across accounts but not family-shared receipts', async () => {
    const [a, b, fam] = [ids[1]!, ids[2]!, ids[3]!];
    const shared = receipt('shared');

    const first = await iap.redeem(a, 'apple', shared, product);
    expect(first.granted).toBe(true);

    // a different account replays the same transaction → reuse → held
    const reuse = await iap.redeem(b, 'apple', shared, product);
    expect(reuse).toMatchObject({ granted: false, held: true, duplicate: true });
    const queue = await fraud.pendingReviews();
    expect(queue.find((r) => r.userId === b)!.flags).toContain('RECEIPT_REUSE');

    // a family-shared replay is legitimate → not flagged, just no double grant
    const famShared = receipt('famshared', 'family_shared');
    await iap.redeem(a, 'apple', famShared, product); // original owner
    const famReplay = await iap.redeem(fam, 'apple', famShared, product);
    expect(famReplay.held).toBe(false);
    expect(famReplay.duplicate).toBe(true);
    expect((await fraud.pendingReviews()).find((r) => r.userId === fam)).toBeUndefined();
  });

  it('confirm keeps the hold in place', async () => {
    const b = ids[2]!;
    const review = (await fraud.pendingReviews()).find((r) => r.userId === b)!;
    const res = await fraud.resolve(review.id, 'confirm', ids[1]!);
    expect(res.status).toBe('confirmed');
    // b is still held → a fresh purchase is withheld
    const held = await iap.redeem(b, 'apple', receipt('b-after-confirm'), product);
    expect(held.held).toBe(true);
  });

  it('admin fraud queue endpoint is admin-only', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/fraud/reviews',
      remoteAddress: '10.73.0.9',
    });
    expect(res.statusCode).toBe(401);
  });
});
