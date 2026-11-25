/** The daily cycle against real Postgres: a Hevalo+ member's Zêr, and everyone's gift for the gift bag. */
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
    expect(day7).toMatchObject({ cycleDay: 7, reward: 50 });

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

  describe('Zêr for Hevalo+ members, a gift for the bag for everyone', () => {
    const bag = async (id: string) => (await pool.query<{ sku: string; count: number }>(`SELECT sku, count FROM gift_bag WHERE user_id = $1`, [id])).rows;

    it('pays anyone else no Zêr, and puts a glass of tea in their bag', async () => {
      const plain = await member('plain', null);
      await streaks.recordActivity(plain, 'UTC', at('2026-06-01'));
      expect(await rewards.status(plain, at('2026-06-01'))).toMatchObject({ member: false, canClaim: true, learnedToday: true });
      const claimed = await rewards.claim(plain, at('2026-06-01'));
      expect(claimed).toMatchObject({ claimed: true, reward: 0, member: false, nudges: true, bagGift: { sku: 'gift-cay', name: 'Çay', assetUrl: '/cosmetics/gifts/made-01-cay.png' } });
      expect((await wallet.balances(plain)).zer).toBe(0);
      expect(await bag(plain)).toEqual([{ sku: 'gift-cay', count: 1 }]);
      // shown with the claim, so not told of again
      const unseen = await pool.query(`SELECT 1 FROM gift_bag_grants WHERE user_id = $1 AND seen_at IS NULL`, [plain]);
      expect(unseen.rowCount).toBe(0);
    });

    it('says what Hevalo+ adds only to a known adult, never to someone under 18 or of unknown age', async () => {
      const teen = (await makeLearner(pool, `daily_teen_${suffix}`, { age: 15 })).id;
      const unknown = (await makeLearner(pool, `daily_unknown_${suffix}`, { age: null })).id;
      expect(await claimOn(teen, '2026-06-01')).toMatchObject({ claimed: true, nudges: false });
      expect(await claimOn(unknown, '2026-06-01')).toMatchObject({ claimed: true, nudges: false });
    });

    it('gives a member the bag’s gift beside the Zêr', async () => {
      const id = await member('both', '2030-01-01T00:00:00Z');
      expect(await claimOn(id, '2026-06-01')).toMatchObject({ reward: rewardForDay(1), member: true, bagGift: { sku: 'gift-cay' } });
    });

    it('stops paying Zêr when membership ends, and keeps the bag’s gift', async () => {
      const lapsed = await member('lapsed', '2026-06-02T00:00:00Z');
      expect(await claimOn(lapsed, '2026-06-01')).toMatchObject({ claimed: true, reward: rewardForDay(1) });
      expect(await claimOn(lapsed, '2026-06-02')).toMatchObject({ claimed: true, reward: 0, member: false, bagGift: { sku: 'gift-cay' } });
      expect(await bag(lapsed)).toEqual([{ sku: 'gift-cay', count: 2 }]);
    });

    it('gives a child’s profile nothing', async () => {
      const child = await member('child', null);
      await pool.query(`UPDATE users SET kind = 'child' WHERE id = $1`, [child]);
      await streaks.recordActivity(child, 'UTC', at('2026-06-01'));
      expect((await rewards.status(child, at('2026-06-01'))).canClaim).toBe(false);
      await expect(rewards.claim(child, at('2026-06-01'))).rejects.toMatchObject({ statusCode: 403 });
      expect(await bag(child)).toEqual([]);
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
