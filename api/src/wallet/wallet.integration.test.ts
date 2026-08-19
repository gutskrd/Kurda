/** Wallet + ledger invariants (KUR-066) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { InsufficientFundsError, WalletService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('wallet (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  let token: string;
  let userId: string;
  const suffix = Date.now().toString(36);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `wallet_${suffix}@it.kurda.app`,
        username: `wallet_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.19.0.1',
    });
    token = res.json().tokens.accessToken;
    userId = res.json().user.id;
  });

  afterAll(async () => {
    // user hard-delete cascades into the ledger, which requires the
    // explicit transaction-scoped admin flag (see wallet migration)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('credits and debits update the balance with matching ledger rows', async () => {
    const credited = await wallet.credit({
      userId,
      currency: 'zer',
      amount: 100,
      reason: 'daily_reward',
    });
    expect(credited).toEqual({ applied: true, duplicate: false, balance: 100 });

    const debited = await wallet.debit({
      userId,
      currency: 'zer',
      amount: 30,
      reason: 'shop_purchase',
      refId: 'order-1',
    });
    expect(debited.balance).toBe(70);
    expect(await wallet.verifyConsistency(userId, 'zer')).toBe(true);
  });

  it('debits can never overdraw', async () => {
    await expect(
      wallet.debit({ userId, currency: 'zer', amount: 10_000, reason: 'shop_purchase' }),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
    expect((await wallet.balances(userId)).zer).toBe(70);
  });

  it('two simultaneous spends of the same balance: exactly one succeeds', async () => {
    await wallet.credit({ userId, currency: 'gems', amount: 50, reason: 'achievement' });

    const spend = () =>
      wallet
        .debit({ userId, currency: 'gems', amount: 50, reason: 'shop_purchase' })
        .then(() => 'ok' as const)
        .catch((err) =>
          err instanceof InsufficientFundsError ? ('insufficient' as const) : Promise.reject(err),
        );

    const results = await Promise.all([spend(), spend()]);
    expect(results.sort()).toEqual(['insufficient', 'ok']);
    expect((await wallet.balances(userId)).gems).toBe(0);
    expect(await wallet.verifyConsistency(userId, 'gems')).toBe(true);
  });

  it('idempotency keys make retries safe (credit and debit)', async () => {
    const key = `it-credit-${suffix}`;
    const first = await wallet.credit({
      userId,
      currency: 'zer',
      amount: 25,
      reason: 'quest_reward',
      idempotencyKey: key,
    });
    const retry = await wallet.credit({
      userId,
      currency: 'zer',
      amount: 25,
      reason: 'quest_reward',
      idempotencyKey: key,
    });
    expect(first.applied).toBe(true);
    expect(retry).toEqual({ applied: false, duplicate: true, balance: 95 });

    const rows = await pool.query(
      `SELECT count(*)::int AS n FROM wallet_ledger WHERE idempotency_key = $1`,
      [key],
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('the ledger is append-only at the database level', async () => {
    await expect(
      pool.query(`UPDATE wallet_ledger SET amount = 9999 WHERE user_id = $1`, [userId]),
    ).rejects.toThrow(/append-only/);
    await expect(
      pool.query(`DELETE FROM wallet_ledger WHERE user_id = $1`, [userId]),
    ).rejects.toThrow(/append-only/);
  });

  it('UPDATE stays blocked even under the delete escape hatch', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await expect(
        client.query(`UPDATE wallet_ledger SET amount = 1 WHERE user_id = $1`, [userId]),
      ).rejects.toThrow(/append-only/);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });

  it('rejects zero/negative/fractional amounts at the service boundary', async () => {
    for (const amount of [0, -5, 1.5]) {
      await expect(
        wallet.credit({ userId, currency: 'zer', amount, reason: 'x' }),
      ).rejects.toThrow(/positive integers/);
    }
  });

  it('GET /me/wallet returns balances and recent history', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/me/wallet',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.19.0.2',
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.balances.zer).toBe(95);
    expect(body.balances.gems).toBe(0);
    expect(body.history.length).toBeGreaterThanOrEqual(4);
    expect(body.history[0]).toHaveProperty('reason');
  });
});
