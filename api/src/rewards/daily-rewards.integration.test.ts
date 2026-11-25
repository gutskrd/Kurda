/** Daily Zêr rewards, a Hevalo+ member's, against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { DAILY_EARNED_ZER_CAP } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { DailyRewardService } from './service.js';
import { WalletService } from '../wallet/service.js';
import { StreakService } from '../streaks/service.js';
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

  /** A finished lesson or practice session on `day`, which a claim needs. */
  const learn = (day: string) => streaks.recordActivity(userId, 'UTC', at(day));
  const learnAndClaim = async (day: string) => {
    await learn(day);
    return rewards.claim(userId, at(day));
  };
  const member = async (tag: string, until: string | null): Promise<string> => {
    const who = await makeLearner(pool, `daily_${tag}_${suffix}`);
    await pool.query(`UPDATE users SET premium_until = $2 WHERE id = $1`, [who.id, until]);
    return who.id;
  };
  const claimOn = async (id: string, day: string) => {
    await streaks.recordActivity(id, 'UTC', at(day));
    return rewards.claim(id, at(day));
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
    // a member until long after every day this file claims on
    await pool.query(`UPDATE users SET timezone = 'UTC', premium_until = '2030-01-01T00:00:00Z' WHERE id = $1`, [userId]);
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
    expect(before).toMatchObject({ canClaim: false, learnedToday: false, alreadyClaimedToday: false, member: true });
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

    await expect(rewards.claim(userId, at('2026-03-01'))).rejects.toThrow(/already claimed/i);

    const d2 = await learnAndClaim('2026-03-02');
    expect(d2.cycleDay).toBe(2);
    expect(d2.reward).toBe(rewardForDay(2));
  });

  it('continues where it left off after a missed day', async () => {
    const next = await learnAndClaim('2026-03-04');
    expect(next.cycleDay).toBe(3);
    expect(next.reward).toBe(rewardForDay(3));
  });

  it('pays the day-7 bonus then wraps to day 1', async () => {
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

  describe('only for Hevalo+ members', () => {
    it('is not there for anyone else, learning or not', async () => {
      const plain = await member('plain', null);
      await streaks.recordActivity(plain, 'UTC', at('2026-06-01'));
      expect(await rewards.status(plain, at('2026-06-01'))).toMatchObject({ member: false, canClaim: false, learnedToday: true });
      await expect(rewards.claim(plain, at('2026-06-01'))).rejects.toMatchObject({ code: 'MEMBERS_ONLY', statusCode: 403 });
      expect((await wallet.balances(plain)).zer).toBe(0);
    });

    it('stops when membership ends', async () => {
      const lapsed = await member('lapsed', '2026-06-02T00:00:00Z');
      expect(await claimOn(lapsed, '2026-06-01')).toMatchObject({ claimed: true, reward: rewardForDay(1) });
      await streaks.recordActivity(lapsed, 'UTC', at('2026-06-02'));
      await expect(rewards.claim(lapsed, at('2026-06-02'))).rejects.toMatchObject({ code: 'MEMBERS_ONLY' });
    });

    it('is paid once when the claims arrive together', async () => {
      const id = await member('burst', '2030-01-01T00:00:00Z');
      await streaks.recordActivity(id, 'UTC', at('2026-06-01'));
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => rewards.claim(id, at('2026-06-01'))));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await wallet.balances(id)).toEqual({ zer: rewardForDay(1) });
    });

    it('counts toward the day’s earned cap, and pays only what is left of it', async () => {
      const id = await member('cap', '2030-01-01T00:00:00Z');
      await wallet.credit({ userId: id, currency: 'zer', amount: DAILY_EARNED_ZER_CAP - 4, reason: 'earn:test', idempotencyKey: `cap:${suffix}:${id}` });
      expect(await claimOn(id, '2026-06-01')).toMatchObject({ claimed: true, reward: 4 });
      expect((await wallet.balances(id)).zer).toBe(DAILY_EARNED_ZER_CAP);
    });
  });
});
