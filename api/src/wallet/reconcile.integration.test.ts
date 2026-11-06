/**
 * The wallet's guarantees against real Postgres: the reconciliation that
 * reports a balance differing from its ledger, the admin route that asks it,
 * and the limits the database holds on its own (migration 1751000214000) — an
 * amount past ten million, a row without a reason, a balance past a billion,
 * and TRUNCATE are all refused.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { makeLearner, removeLearners, type TestLearner } from '../test/progress.js';
import { MAX_BALANCE, MAX_LEDGER_AMOUNT, WalletService } from './service.js';
import { WalletReconciler } from './reconcile.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('wallet reconciliation and limits (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  let reconciler: WalletReconciler;
  const suffix = Date.now().toString(36);
  let ann: TestLearner;
  let bea: TestLearner;

  /** Run `sql` in a transaction that is always rolled back, and say how it failed (or null). */
  const refusal = async (sql: string, params: unknown[] = []): Promise<string | null> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql, params);
      return null;
    } catch (err) {
      return (err as Error).message;
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    reconciler = new WalletReconciler(pool);
    ann = await makeLearner(pool, `wrc_ann_${suffix}`);
    bea = await makeLearner(pool, `wrc_bea_${suffix}`);
  });

  afterAll(async () => {
    // the two made here and the member who signed up
    await removeLearners(pool, `wrc_%_${suffix}@it.kurda.app`);
    await pool.end();
    await app.close();
  });

  it('finds every balance equal to its ledger when the wallet wrote both', async () => {
    await wallet.credit({ userId: ann.id, currency: 'zer', amount: 300, reason: 'admin_adjustment' });
    await wallet.debit({ userId: ann.id, currency: 'zer', amount: 120, reason: 'shop_purchase' });
    await wallet.credit({ userId: ann.id, currency: 'gems', amount: 9, reason: 'admin_adjustment' });
    const report = await reconciler.check({ userIds: [ann.id, bea.id] });
    expect(report).toMatchObject({ checked: 2, mismatched: 0, mismatches: [] });
    expect(await wallet.verifyConsistency(ann.id, 'zer')).toBe(true);
  });

  it('reports a balance written around the ledger, with both numbers, and an empty scope as nothing to check', async () => {
    // a hand edit: the balance moves and no ledger row says why
    await pool.query(`UPDATE wallet_balances SET balance = balance + 5 WHERE user_id = $1 AND currency = 'zer'`, [ann.id]);
    // and a balance row with nothing at all behind it
    await pool.query(`INSERT INTO wallet_balances (user_id, currency, balance) VALUES ($1, 'gems', 40)`, [bea.id]);
    try {
      const report = await reconciler.check({ userIds: [ann.id, bea.id] });
      expect(report.mismatched).toBe(2);
      // the largest gap first
      expect(report.mismatches).toEqual([
        { userId: bea.id, currency: 'gems', balance: 40, ledgerSum: 0 },
        { userId: ann.id, currency: 'zer', balance: 185, ledgerSum: 180 },
      ]);
      expect((await reconciler.check({ userIds: [ann.id, bea.id], limit: 1 })).mismatches).toHaveLength(1);
      expect(await reconciler.check({ userIds: [] })).toMatchObject({ checked: 0, mismatched: 0 });
      // the whole database is checked too, these two among whatever else is there
      const all = await reconciler.check({ limit: 200 });
      expect(all.mismatched).toBeGreaterThanOrEqual(2);
    } finally {
      await pool.query(`UPDATE wallet_balances SET balance = balance - 5 WHERE user_id = $1 AND currency = 'zer'`, [ann.id]);
      await pool.query(`DELETE FROM wallet_balances WHERE user_id = $1 AND currency = 'gems'`, [bea.id]);
    }
    expect((await reconciler.check({ userIds: [ann.id, bea.id] })).mismatched).toBe(0);
  });

  it('answers the admin route only for staff', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `wrc_member_${suffix}@it.kurda.app`,
        username: `wrc_member_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.214.0.1',
    });
    await activate(app, pool, res);
    const member = await app.inject({
      method: 'GET',
      url: '/admin/economy/reconcile',
      headers: { authorization: `Bearer ${res.json().tokens.accessToken}` },
      remoteAddress: '10.214.0.1',
    });
    expect(member.statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/admin/economy/reconcile', remoteAddress: '10.214.0.2' })).statusCode).toBe(401);
  });

  it('refuses at the database an amount past the bound, a row without a reason, and TRUNCATE', async () => {
    const insert = `INSERT INTO wallet_ledger (user_id, currency, amount, reason) VALUES ($1, 'zer', $2, $3)`;
    expect(await refusal(insert, [ann.id, MAX_LEDGER_AMOUNT + 1, 'test'])).toMatch(/wallet_ledger_amount_bounds/);
    expect(await refusal(insert, [ann.id, -(MAX_LEDGER_AMOUNT + 1), 'test'])).toMatch(/wallet_ledger_amount_bounds/);
    expect(await refusal(insert, [ann.id, 5, ''])).toMatch(/wallet_ledger_reason_present/);
    expect(await refusal(insert, [ann.id, 5, 'x'.repeat(101)])).toMatch(/wallet_ledger_reason_present/);
    // the bound itself is allowed
    expect(await refusal(insert, [ann.id, MAX_LEDGER_AMOUNT, 'test'])).toBeNull();
    // rolled back whatever happens, so even a missing guard would not empty the ledger
    expect(await refusal(`TRUNCATE wallet_ledger`)).toMatch(/append-only/);
  });

  it('refuses a balance past the ceiling, at the database and in the wallet', async () => {
    expect(
      await refusal(`INSERT INTO wallet_balances (user_id, currency, balance) VALUES ($1, 'gems', $2)`, [bea.id, MAX_BALANCE + 1]),
    ).toMatch(/wallet_balances_ceiling/);
    await pool.query(`INSERT INTO wallet_balances (user_id, currency, balance) VALUES ($1, 'gems', $2)`, [bea.id, MAX_BALANCE - 10]);
    try {
      await expect(wallet.credit({ userId: bea.id, currency: 'gems', amount: 11, reason: 'admin_adjustment' })).rejects.toMatchObject({
        code: 'BALANCE_LIMIT',
      });
      expect((await wallet.balances(bea.id)).gems).toBe(MAX_BALANCE - 10);
    } finally {
      await pool.query(`DELETE FROM wallet_balances WHERE user_id = $1 AND currency = 'gems'`, [bea.id]);
    }
    // and a single change past the bound is refused before it reaches the database
    await expect(wallet.credit({ userId: bea.id, currency: 'zer', amount: MAX_LEDGER_AMOUNT + 1, reason: 'admin_adjustment' })).rejects.toThrow(
      /at most/,
    );
  });
});
