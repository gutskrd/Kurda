/** Daily Zêr rewards (KUR-067) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { PLUS_DAILY_GEMS } from '@kurda/shared';
import { DailyRewardService, PLUS_DAILY_REASON } from './service.js';
import { WalletService } from '../wallet/service.js';
import { StreakService } from '../streaks/service.js';
import { GemService } from '../gems/service.js';
import { makeLearner } from '../test/progress.js';
import { rewardForDay } from './daily-cycle.js';

const DATABASE_URL = process.env.DATABASE_URL;

const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

describe.skipIf(!DATABASE_URL)('daily rewards (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let rewards: DailyRewardService;
  let wallet: WalletService;
  let streaks: StreakService;
  const suffix = Date.now().toString(36);
  let userId = '';

  /** A finished lesson or practice session on `day` — what a claim needs. */
  const learn = (day: string) => streaks.recordActivity(userId, 'UTC', at(day));
  const learnAndClaim = async (day: string) => {
    await learn(day);
    return rewards.claim(userId, at(day));
  };

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    rewards = new DailyRewardService(pool, wallet);
    streaks = new StreakService(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `daily_${suffix}@it.kurda.app`,
        username: `daily_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.67.0.1',
    });
    userId = res.json().user.id;
    await pool.query(`UPDATE users SET timezone = 'UTC' WHERE id = $1`, [userId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM gem_rules WHERE key = $1`, [`dailycap_${suffix}`]);
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

  it('pays only on a day with a finished lesson or practice session', async () => {
    const before = await rewards.status(userId, at('2026-02-27'));
    expect(before).toMatchObject({ canClaim: false, learnedToday: false, alreadyClaimedToday: false });
    await expect(rewards.claim(userId, at('2026-02-27'))).rejects.toMatchObject({ code: 'LEARN_FIRST' });
    expect((await wallet.balances(userId)).zer).toBe(0);
  });

  it('does not count a daily Peyvok win as learning', async () => {
    await streaks.recordPlayDay(userId, 'UTC', at('2026-02-28'));
    await expect(rewards.claim(userId, at('2026-02-28'))).rejects.toMatchObject({ code: 'LEARN_FIRST' });
  });

  it('escalates across consecutive days and blocks a second same-day claim', async () => {
    const d1 = await learnAndClaim('2026-03-01');
    expect(d1).toMatchObject({ cycleDay: 1, reward: rewardForDay(1) });
    expect((await wallet.balances(userId)).zer).toBe(rewardForDay(1));

    // same day again → rejected
    await expect(rewards.claim(userId, at('2026-03-01'))).rejects.toThrow(/already claimed/i);

    const d2 = await learnAndClaim('2026-03-02');
    expect(d2.cycleDay).toBe(2);
    expect(d2.reward).toBe(rewardForDay(2));
  });

  // deliberately changed: this used to reset to day 1
  it('continues where it left off after a missed day', async () => {
    // last claim was 2026-03-02 (day 2); skip 03-03 and claim 03-04
    const next = await learnAndClaim('2026-03-04');
    expect(next.cycleDay).toBe(3);
    expect(next.reward).toBe(rewardForDay(3));
  });

  it('pays the day-7 bonus then wraps to day 1', async () => {
    // continue from 2026-03-04 (day 3) → day 7 is 2026-03-08
    for (let i = 5; i <= 7; i++) await learnAndClaim(`2026-03-0${i}`);
    const day7 = await learnAndClaim('2026-03-08');
    expect(day7).toMatchObject({ cycleDay: 7, reward: 100 });

    const wrap = await learnAndClaim('2026-03-09');
    expect(wrap.cycleDay).toBe(1);
  });

  it('GET /rewards/daily says what a new day needs, then that it can be claimed', async () => {
    const waiting = await rewards.status(userId, at('2026-03-12'));
    expect(waiting).toMatchObject({ canClaim: false, learnedToday: false, claimableDay: 2 });
    expect(waiting.schedule).toHaveLength(7);

    await learn('2026-03-12');
    const ready = await rewards.status(userId, at('2026-03-12'));
    expect(ready).toMatchObject({ canClaim: true, learnedToday: true, claimableDay: 2 });
  });

  /**
   * A Hevalo+ member's daily gems: with the claim, once a day, and not a gem
   * rule's grant, so the cap on earned gems neither counts them nor stops them.
   */
  describe('a Hevalo+ member’s daily gems', () => {
    const member = async (tag: string, until: string | null): Promise<string> => {
      const who = await makeLearner(pool, `daily_${tag}_${suffix}`);
      await pool.query(`UPDATE users SET premium_until = $2 WHERE id = $1`, [who.id, until]);
      return who.id;
    };
    const claimOn = async (id: string, day: string) => {
      await streaks.recordActivity(id, 'UTC', at(day));
      return rewards.claim(id, at(day));
    };
    const plusRows = async (id: string) =>
      (await pool.query<{ amount: number }>(`SELECT amount FROM wallet_ledger WHERE user_id = $1 AND reason = $2`, [id, PLUS_DAILY_REASON])).rows.map(
        (r) => r.amount,
      );

    it('are paid with the day’s reward, once a day, in the ledger under their own reason', async () => {
      const id = await member('plus', '2027-01-01T00:00:00Z');
      expect(await rewards.status(id, at('2026-06-01'))).toMatchObject({ plusGems: PLUS_DAILY_GEMS });
      // nothing without a claim, and no claim without learning
      await expect(rewards.claim(id, at('2026-06-01'))).rejects.toMatchObject({ code: 'LEARN_FIRST' });
      expect((await wallet.balances(id)).gems).toBe(0);

      const first = await claimOn(id, '2026-06-01');
      expect(first).toMatchObject({ claimed: true, reward: rewardForDay(1), plusGems: 5 });
      expect(await wallet.balances(id)).toEqual({ zer: rewardForDay(1), gems: 5 });
      await expect(rewards.claim(id, at('2026-06-01'))).rejects.toMatchObject({ code: 'ALREADY_CLAIMED' });
      expect(await plusRows(id)).toEqual([5]);

      expect(await claimOn(id, '2026-06-02')).toMatchObject({ plusGems: 5 });
      expect(await plusRows(id)).toEqual([5, 5]);
      expect(await wallet.verifyConsistency(id, 'gems')).toBe(true);
    });

    it('are paid once when the claims arrive together', async () => {
      const id = await member('burst', '2027-01-01T00:00:00Z');
      await streaks.recordActivity(id, 'UTC', at('2026-06-01'));
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => rewards.claim(id, at('2026-06-01'))));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await wallet.balances(id)).toEqual({ zer: rewardForDay(1), gems: 5 });
    });

    it('stand outside the daily cap on earned gems', async () => {
      const id = await member('cap', '2027-01-01T00:00:00Z');
      const capped = new GemService(pool, wallet, 15); // a low cap, reached by one grant
      await capped.upsertRule({ key: `dailycap_${suffix}`, amount: 15, dailyCap: null, cooldownSeconds: 0, active: true });
      expect(await capped.grant(id, `dailycap_${suffix}`, `a:${id}`)).toEqual({ granted: 15, cappedBy: 'none' });
      expect(await capped.grant(id, `dailycap_${suffix}`, `b:${id}`)).toEqual({ granted: 0, cappedBy: 'global_cap' });
      // the cap is full, and the member's gems are paid all the same
      expect(await claimOn(id, '2026-06-01')).toMatchObject({ plusGems: 5 });
      expect((await wallet.balances(id)).gems).toBe(20);

      // nor do they use the cap up: a member who claimed first still earns the whole of it
      const other = await member('cap2', '2027-01-01T00:00:00Z');
      await claimOn(other, '2026-06-01');
      expect(await capped.grant(other, `dailycap_${suffix}`, `a:${other}`)).toEqual({ granted: 15, cappedBy: 'none' });
    });

    it('are not paid to anyone else, nor after membership has ended', async () => {
      const plain = await member('plain', null);
      expect(await rewards.status(plain, at('2026-06-01'))).toMatchObject({ plusGems: 0 });
      expect(await claimOn(plain, '2026-06-01')).toMatchObject({ claimed: true, plusGems: 0 });
      expect((await wallet.balances(plain)).gems).toBe(0);

      const lapsed = await member('lapsed', '2026-06-02T00:00:00Z');
      expect(await claimOn(lapsed, '2026-06-01')).toMatchObject({ plusGems: 5 });
      expect(await claimOn(lapsed, '2026-06-02')).toMatchObject({ plusGems: 0 });
      expect(await plusRows(lapsed)).toEqual([5]);
    });
  });
});
