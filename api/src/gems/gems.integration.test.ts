/**
 * Config-driven Gem grants (KUR-068) against real Postgres: the amount, the
 * caps, the cooldown and the once-per-event key, on rules made for this suite
 * — and which of the seeded rules still pay, now that the two anybody could
 * farm are switched off.
 */
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
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
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
    // test-scoped rules so we don't depend on the seeded amounts, or on which seeded rules are switched on
    await gems.upsertRule({ key: `earn_${suffix}`, amount: 15, dailyCap: null, cooldownSeconds: 0, active: true });
    await gems.upsertRule({ key: `off_${suffix}`, amount: 15, dailyCap: null, cooldownSeconds: 0, active: false });
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
    const rule = `earn_${suffix}`; // amount 15
    const first = await gems.grant(ids[0]!, rule, `ach-1:${suffix}`);
    expect(first).toEqual({ granted: 15, cappedBy: 'none' });
    const again = await gems.grant(ids[0]!, rule, `ach-1:${suffix}`);
    expect(again).toEqual({ granted: 0, cappedBy: 'duplicate' });
    expect((await wallet.balances(ids[0]!)).gems).toBe(15);
    // in the ledger once, under the rule's reason, and the balance is its sum
    const rows = await pool.query<{ amount: number }>(`SELECT amount FROM wallet_ledger WHERE user_id = $1 AND reason = $2`, [ids[0], `gem_earn:${rule}`]);
    expect(rows.rows).toEqual([{ amount: 15 }]);
    expect(await wallet.verifyConsistency(ids[0]!, 'gems')).toBe(true);
  });

  it('returns no_rule for an unknown or inactive rule, and pays once an admin switches it on', async () => {
    expect(await gems.grant(ids[0]!, 'does_not_exist', 'x')).toEqual({ granted: 0, cappedBy: 'no_rule' });
    const rule = `off_${suffix}`;
    expect(await gems.grant(ids[0]!, rule, `off-1:${suffix}`)).toEqual({ granted: 0, cappedBy: 'no_rule' });
    expect((await wallet.balances(ids[0]!)).gems).toBe(15);
    // nothing was written for the refused grant, so the same event is paid when the rule is on
    await gems.upsertRule({ key: rule, amount: 15, dailyCap: null, cooldownSeconds: 0, active: true });
    expect(await gems.grant(ids[0]!, rule, `off-1:${suffix}`)).toEqual({ granted: 15, cappedBy: 'none' });
    expect((await wallet.balances(ids[0]!)).gems).toBe(30);
  });

  /**
   * Free gems are rare (migration 1751000312000): a perfect lesson and an
   * achievement, which anybody could repeat for more, pay nothing. Both rules
   * are still in the table for an admin to switch back on.
   */
  it('pays nothing for a perfect lesson or an achievement, the two rules now switched off', async () => {
    const u = ids[0]!;
    const before = (await wallet.balances(u)).gems;
    expect(await gems.grant(u, 'perfect_lesson', `p:${u}`)).toEqual({ granted: 0, cappedBy: 'no_rule' });
    expect(await gems.grant(u, 'achievement_milestone', `a:${u}`)).toEqual({ granted: 0, cappedBy: 'no_rule' });
    expect((await wallet.balances(u)).gems).toBe(before);
    const farmed = await pool.query(
      `SELECT 1 FROM wallet_ledger WHERE user_id = $1 AND reason IN ('gem_earn:perfect_lesson', 'gem_earn:achievement_milestone')`,
      [u],
    );
    expect(farmed.rowCount).toBe(0);
  });

  it('still pays for moving up a league and for winning a tournament', async () => {
    const u = ids[0]!;
    const rules = Object.fromEntries((await gems.rules()).map((r) => [r.key, r]));
    const before = (await wallet.balances(u)).gems;
    const promoted = await gems.grant(u, 'league_promotion', `season:tier:${u}`);
    expect(promoted).toEqual({ granted: rules['league_promotion']!.amount, cappedBy: 'none' });
    const won = await gems.grant(u, 'tournament_win', `tournament:${u}`);
    expect(won).toEqual({ granted: rules['tournament_win']!.amount, cappedBy: 'none' });
    expect((await wallet.balances(u)).gems).toBe(before + promoted.granted + won.granted);
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
    const rule = `earn_${suffix}`; // amount 15
    expect((await capped.grant(u, rule, `g1:${suffix}`)).granted).toBe(15);
    expect((await capped.grant(u, rule, `g2:${suffix}`)).granted).toBe(15); // 30 total
    expect(await capped.grant(u, rule, `g3:${suffix}`)).toEqual({ granted: 0, cappedBy: 'global_cap' });
    expect((await wallet.balances(u)).gems).toBe(30);
  });

  it('exposes the seeded rules via the config table, with which of them are on', async () => {
    const rules = await gems.rules();
    const active = Object.fromEntries(rules.map((r) => [r.key, r.active]));
    expect(active).toMatchObject({ perfect_lesson: false, achievement_milestone: false, league_promotion: true, tournament_win: true });
  });
});
