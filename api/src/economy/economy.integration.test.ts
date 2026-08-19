/** Economy monitoring (KUR-074) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { EconomyService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

// isolated past days: concurrent tests only ever write ledger rows dated now(),
// so aggregating a past day gives us exact, pollution-free totals.
const dayISO = (agoDays: number): string => {
  const d = new Date(Date.now() - agoDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};
const D3 = dayISO(3);
const D5 = dayISO(5);

describe.skipIf(!DATABASE_URL)('economy monitoring (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let economy: EconomyService;
  const suffix = Date.now().toString(36);
  let userId = '';

  const ledger = async (day: string, amount: number, reason: string): Promise<void> => {
    await pool.query(
      `INSERT INTO wallet_ledger (user_id, currency, amount, reason, created_at)
       VALUES ($1, 'zer', $2, $3, ($4 || 'T12:00:00Z')::timestamptz)`,
      [userId, amount, reason, day],
    );
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    economy = new EconomyService(pool);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `econ_${suffix}@it.kurda.app`,
        username: `econ_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: '10.74.0.1',
    });
    userId = res.json().user.id;

    // D3: +300 faucet, −100 sink, +9999 excluded (admin adjustment)
    await ledger(D3, 300, 'daily_reward');
    await ledger(D3, -100, 'shop_purchase');
    await ledger(D3, 9999, 'admin_adjustment');
    // D5: +200 faucet, −400 sink
    await ledger(D5, 200, 'quest_reward');
    await ledger(D5, -400, 'shop_purchase');

    await economy.aggregateDay(new Date(`${D3}T12:00:00Z`));
    await economy.aggregateDay(new Date(`${D5}T12:00:00Z`));
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM economy_daily WHERE day IN ($1::date, $2::date)`, [D3, D5]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('aggregates faucet/sink per day, excluding admin/migration reasons', async () => {
    const row = await pool.query<{ faucet: string; sink: string; net: string }>(
      `SELECT faucet, sink, net FROM economy_daily WHERE day = $1::date AND currency = 'zer'`,
      [D3],
    );
    // the +9999 admin_adjustment is excluded
    expect(row.rows[0]).toMatchObject({ faucet: '300', sink: '100', net: '200' });
  });

  it('re-aggregating a day is idempotent', async () => {
    await economy.aggregateDay(new Date(`${D3}T12:00:00Z`));
    const row = await pool.query<{ faucet: string }>(
      `SELECT faucet FROM economy_daily WHERE day = $1::date AND currency = 'zer'`,
      [D3],
    );
    expect(row.rows[0]!.faucet).toBe('300');
  });

  it('supply series carries a running net total, oldest first', async () => {
    const points = await economy.supply('zer', 30);
    const d5 = points.find((p) => p.day === D5)!;
    const d3 = points.find((p) => p.day === D3)!;
    expect(d5).toMatchObject({ faucet: 200, sink: 400, net: -200 });
    expect(d3).toMatchObject({ faucet: 300, sink: 100, net: 200 });
    // running supply: D5 (−200) then D3 (−200 + 200 = 0)
    expect(d5.supply).toBe(-200);
    expect(d3.supply).toBe(0);
  });

  it('drift reports the weekly faucet/sink ratio and alerts past tolerance', async () => {
    // last 7 days = D3 + D5 → faucet 500, sink 500, ratio 1.0
    const balanced = await economy.drift('zer', 1);
    expect(balanced).toMatchObject({ faucet: 500, sink: 500, drifting: false });
    expect(balanced.ratio).toBeCloseTo(1, 5);

    // a target of 2.0 is > 20% away from the actual 1.0 → alert
    const skewed = await economy.drift('zer', 2);
    expect(skewed.drifting).toBe(true);
  });

  it('the dashboard endpoints are admin-only', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/economy/supply?currency=zer',
      remoteAddress: '10.74.0.2',
    });
    expect(res.statusCode).toBe(401);
  });
});
