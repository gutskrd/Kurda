/** Daily Zêr rewards (KUR-067) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { DailyRewardService } from './service.js';
import { WalletService } from '../wallet/service.js';
import { StreakService } from '../streaks/service.js';
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
      },
      remoteAddress: '10.67.0.1',
    });
    userId = res.json().user.id;
    await pool.query(`UPDATE users SET timezone = 'UTC' WHERE id = $1`, [userId]);
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
    await pool.end();
    await app.close();
  });

  it('pays only on a day with a finished lesson or practice session', async () => {
    const before = await rewards.status(userId, at('2026-02-27'));
    expect(before).toMatchObject({ canClaim: false, learnedToday: false, alreadyClaimedToday: false });
    await expect(rewards.claim(userId, at('2026-02-27'))).rejects.toMatchObject({ code: 'LEARN_FIRST' });
    expect((await wallet.balances(userId)).zer).toBe(0);
  });

  it('does not count a daily Wordle win as learning', async () => {
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
});
