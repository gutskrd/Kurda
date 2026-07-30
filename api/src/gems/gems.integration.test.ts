/** Config-driven Gem grants (KUR-068) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { GemService } from './service.js';
import { WalletService } from '../wallet/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('gem earning (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  let gems: GemService;
  const suffix = Date.now().toString(36);
  const ids: string[] = [];

  const register = async (tag: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `gem_${tag}_${suffix}@it.kurda.app`,
        username: `gem_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password',
        acceptTerms: true,
      },
      remoteAddress: '10.68.0.1',
    });
    return res.json().user.id as string;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    gems = new GemService(pool, wallet);
    ids.push(await register('a'), await register('b'), await register('c'));
    // test-scoped rules so we don't depend on the seeded amounts
    await gems.upsertRule({ key: `capped_${suffix}`, amount: 40, dailyCap: 50, cooldownSeconds: 0, active: true });
    await gems.upsertRule({ key: `cooldown_${suffix}`, amount: 5, dailyCap: null, cooldownSeconds: 3600, active: true });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM gem_rules WHERE key LIKE '%_${suffix}'`);
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

  it('grants the configured amount and is idempotent per (rule, refId)', async () => {
    const first = await gems.grant(ids[0]!, 'achievement_milestone', 'ach-1'); // seeded amount 15
    expect(first).toEqual({ granted: 15, cappedBy: 'none' });
    const again = await gems.grant(ids[0]!, 'achievement_milestone', 'ach-1');
    expect(again).toEqual({ granted: 0, cappedBy: 'duplicate' });
    expect((await wallet.balances(ids[0]!)).gems).toBe(15);
  });

  it('returns no_rule for an unknown or inactive rule', async () => {
    expect(await gems.grant(ids[0]!, 'does_not_exist', 'x')).toEqual({ granted: 0, cappedBy: 'no_rule' });
  });

  it('clamps to the per-rule daily cap then blocks further grants', async () => {
    const u = ids[1]!;
    const rule = `capped_${suffix}`; // amount 40, cap 50
    expect((await gems.grant(u, rule, 'r1')).granted).toBe(40);
    // 10 left under the cap → the next grant is clamped
    expect(await gems.grant(u, rule, 'r2')).toEqual({ granted: 10, cappedBy: 'rule_cap' });
    // cap reached → nothing more
    expect(await gems.grant(u, rule, 'r3')).toEqual({ granted: 0, cappedBy: 'rule_cap' });
    expect((await wallet.balances(u)).gems).toBe(50);
  });

  it('enforces a cooldown between grants of the same rule', async () => {
    const u = ids[1]!;
    const rule = `cooldown_${suffix}`;
    expect((await gems.grant(u, rule, 'c1')).granted).toBe(5);
    // different refId, but within the cooldown window
    expect(await gems.grant(u, rule, 'c2')).toEqual({ granted: 0, cappedBy: 'cooldown' });
  });

  it('enforces the per-user global daily cap across rules', async () => {
    const capped = new GemService(pool, wallet, 30); // low global cap for this check
    const u = ids[2]!;
    expect((await capped.grant(u, 'achievement_milestone', 'g1')).granted).toBe(15);
    expect((await capped.grant(u, 'achievement_milestone', 'g2')).granted).toBe(15); // 30 total
    expect(await capped.grant(u, 'achievement_milestone', 'g3')).toEqual({ granted: 0, cappedBy: 'global_cap' });
    expect((await wallet.balances(u)).gems).toBe(30);
  });

  it('exposes the seeded rules via the config table', async () => {
    const rules = await gems.rules();
    const keys = rules.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['perfect_lesson', 'tournament_win', 'achievement_milestone']));
  });
});
