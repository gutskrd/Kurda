/**
 * Earned Zêr against real Postgres: rule grants (amount, caps, cooldown and the once-per-event key on rules made for
 * this suite, and which seeded rules still pay), the daily cap over every earned source, and a per-day count.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { EarnService, earnReason } from './service.js';
import { WalletService } from '../wallet/service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('earning Zêr (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  let earn: EarnService;
  const suffix = Date.now().toString(36);
  const ids: string[] = [];

  let ip = 0;
  const register = async (tag: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `earn_${tag}_${suffix}@it.kurda.app`,
        username: `earn_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: `10.68.${++ip}.1`,
    });
    return res.json().user.id as string;
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    earn = new EarnService(pool, wallet);
    ids.push(await register('a'), await register('b'), await register('c'), await register('d'));
    // Rules of this suite's own, independent of seeded amounts and switches.
    await earn.upsertRule({ key: `earn_${suffix}`, amount: 15, dailyCap: null, cooldownSeconds: 0, active: true });
    await earn.upsertRule({ key: `off_${suffix}`, amount: 15, dailyCap: null, cooldownSeconds: 0, active: false });
    await earn.upsertRule({ key: `capped_${suffix}`, amount: 40, dailyCap: 50, cooldownSeconds: 0, active: true });
    await earn.upsertRule({ key: `cooldown_${suffix}`, amount: 5, dailyCap: null, cooldownSeconds: 3600, active: true });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM earn_rules WHERE key LIKE '%_${suffix}'`);
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

  it('grants the configured amount in Zêr and is idempotent per (rule, refId)', async () => {
    const rule = `earn_${suffix}`;
    expect(await earn.grant(ids[0]!, rule, `ach-1:${suffix}`)).toEqual({ granted: 15, cappedBy: 'none' });
    expect(await earn.grant(ids[0]!, rule, `ach-1:${suffix}`)).toEqual({ granted: 0, cappedBy: 'duplicate' });
    expect((await wallet.balances(ids[0]!)).zer).toBe(15);
    const rows = await pool.query<{ amount: number; currency: string }>(`SELECT amount, currency FROM wallet_ledger WHERE user_id = $1 AND reason = $2`, [
      ids[0],
      earnReason(rule),
    ]);
    expect(rows.rows).toEqual([{ amount: 15, currency: 'zer' }]);
    expect(await wallet.verifyConsistency(ids[0]!, 'zer')).toBe(true);
  });

  it('returns no_rule for an unknown or inactive rule, and pays once an admin switches it on', async () => {
    expect(await earn.grant(ids[0]!, 'does_not_exist', 'x')).toEqual({ granted: 0, cappedBy: 'no_rule' });
    const rule = `off_${suffix}`;
    expect(await earn.grant(ids[0]!, rule, `off-1:${suffix}`)).toEqual({ granted: 0, cappedBy: 'no_rule' });
    await earn.upsertRule({ key: rule, amount: 15, dailyCap: null, cooldownSeconds: 0, active: true });
    expect(await earn.grant(ids[0]!, rule, `off-1:${suffix}`)).toEqual({ granted: 15, cappedBy: 'none' });
    expect((await wallet.balances(ids[0]!)).zer).toBe(30);
  });

  it('pays nothing for a perfect lesson or an achievement, the two rules switched off', async () => {
    const u = ids[0]!;
    expect(await earn.grant(u, 'perfect_lesson', `p:${u}`)).toEqual({ granted: 0, cappedBy: 'no_rule' });
    expect(await earn.grant(u, 'achievement_milestone', `a:${u}`)).toEqual({ granted: 0, cappedBy: 'no_rule' });
  });

  it('pays 50 Zêr for moving up a league and 250 for winning a tournament', async () => {
    const u = ids[3]!;
    expect(await earn.grant(u, 'league_promotion', `season:tier:${u}`)).toEqual({ granted: 50, cappedBy: 'none' });
    expect(await earn.grant(u, 'tournament_win', `tournament:${u}`)).toEqual({ granted: 250, cappedBy: 'none' });
    expect((await wallet.balances(u)).zer).toBe(300);
  });

  it('clamps to the per-rule daily cap then blocks further grants', async () => {
    const u = ids[1]!;
    const rule = `capped_${suffix}`;
    expect((await earn.grant(u, rule, 'r1')).granted).toBe(40);
    expect(await earn.grant(u, rule, 'r2')).toEqual({ granted: 10, cappedBy: 'rule_cap' });
    expect(await earn.grant(u, rule, 'r3')).toEqual({ granted: 0, cappedBy: 'rule_cap' });
    expect((await wallet.balances(u)).zer).toBe(50);
  });

  it('enforces a cooldown between grants of the same rule', async () => {
    const u = ids[1]!;
    const rule = `cooldown_${suffix}`;
    expect((await earn.grant(u, rule, 'c1')).granted).toBe(5);
    expect(await earn.grant(u, rule, 'c2')).toEqual({ granted: 0, cappedBy: 'cooldown' });
  });

  it('holds every earned source together to the daily cap, and never counts what was bought', async () => {
    const capped = new EarnService(pool, wallet, 30);
    const u = ids[2]!;
    // a purchase and a members' box are not earned
    await wallet.credit({ userId: u, currency: 'zer', amount: 400, reason: 'iap_purchase', idempotencyKey: `buy:${suffix}:${u}` });
    await wallet.credit({ userId: u, currency: 'zer', amount: 500, reason: 'members_box', idempotencyKey: `box:${suffix}:${u}` });
    // a chest paid earlier today counts toward the cap
    await wallet.credit({ userId: u, currency: 'zer', amount: 10, reason: 'daily_quest', idempotencyKey: `chest:${suffix}:${u}` });
    expect((await capped.grant(u, `earn_${suffix}`, `g1:${suffix}`)).granted).toBe(15);
    expect(await capped.grant(u, `earn_${suffix}`, `g2:${suffix}`)).toEqual({ granted: 5, cappedBy: 'daily_cap' });
    expect(await capped.grant(u, `earn_${suffix}`, `g3:${suffix}`)).toEqual({ granted: 0, cappedBy: 'daily_cap' });
    expect((await wallet.balances(u)).zer).toBe(400 + 500 + 30);
  });

  it('pays a source at most so many times a day', async () => {
    const u = ids[3]!;
    const pay = (n: number) => earn.pay({ userId: u, amount: 10, reason: earnReason(`count_${suffix}`), idempotencyKey: `count:${suffix}:${u}:${n}`, perDay: 2 });
    expect((await pay(1)).granted).toBe(10);
    expect((await pay(2)).granted).toBe(10);
    expect(await pay(3)).toEqual({ granted: 0, cappedBy: 'daily_count' });
  });

  it('exposes the seeded rules, with which of them are on', async () => {
    const rules = Object.fromEntries((await earn.rules()).map((r) => [r.key, r]));
    expect(rules).toMatchObject({
      perfect_lesson: { active: false },
      achievement_milestone: { active: false },
      league_promotion: { active: true, amount: 50 },
      tournament_win: { active: true, amount: 250 },
    });
  });
});
