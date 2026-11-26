/**
 * Winning an ended streak back against real Postgres: what /me offers, the third lesson or practice session of a day
 * winning it back, a Hevalo+ member's free restore a month (POST /me/streak/repair), every refusal (nothing to restore,
 * too short, too late, no free restore left), repeated or concurrent requests restoring once, and the streak milestones
 * the streak pays on the way.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { STREAK_WIN_BACK_SESSIONS } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { makeLearner, removeLearners, type TestLearner } from '../test/progress.js';
import { WalletService } from '../wallet/service.js';
import { StreakService, STREAK_MILESTONE_REASON } from './service.js';
import { localDate, shiftDate } from './streak-logic.js';

const DATABASE_URL = process.env.DATABASE_URL;

const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

describe.skipIf(!DATABASE_URL)('winning a streak back (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  let streaks: StreakService;
  const suffix = Date.now().toString(36);
  let n = 0;

  const learner = (): Promise<TestLearner> => makeLearner(pool, `srp${n++}${suffix}`);

  /** A run of `days` ending on `lastActiveOn`, as the row held it before anything noticed it had ended. */
  const seed = (userId: string, days: number, lastActiveOn: string, freezes = 0) =>
    pool.query(
      `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_on, freezes)
       VALUES ($1, $2, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         current_streak = EXCLUDED.current_streak, longest_streak = EXCLUDED.longest_streak,
         last_active_on = EXCLUDED.last_active_on, freezes = EXCLUDED.freezes,
         ended_streak = 0, ended_last_active_on = NULL, ended_restored_on = NULL, sessions_on = NULL, sessions_today = 0`,
      [userId, days, lastActiveOn, freezes],
    );
  const plus = (userId: string, until: string) => pool.query(`UPDATE users SET premium_until = $2 WHERE id = $1`, [userId, until]);
  const learnTimes = async (userId: string, day: string, times: number) => {
    let last = null;
    for (let i = 0; i < times; i++) last = await streaks.recordActivity(userId, 'UTC', at(day));
    return last!;
  };
  const row = async (userId: string) =>
    (
      await pool.query<{ current: number; last: string; ended: number; ended_last: string | null; restored: string | null }>(
        `SELECT current_streak AS current, last_active_on::text AS last, ended_streak AS ended,
                ended_last_active_on::text AS ended_last, ended_restored_on::text AS restored
           FROM user_streaks WHERE user_id = $1`,
        [userId],
      )
    ).rows[0];
  const repairs = async (userId: string) =>
    (
      await pool.query<{ ended: string; days: number; cost: number; free: boolean; won_back: boolean; on: string }>(
        `SELECT ended_last_active_on::text AS ended, days, cost, free, won_back, repaired_on::text AS on
           FROM streak_repairs WHERE user_id = $1 ORDER BY repaired_on`,
        [userId],
      )
    ).rows;
  const milestonesPaid = async (userId: string) =>
    (
      await pool.query<{ amount: number }>(`SELECT amount FROM wallet_ledger WHERE user_id = $1 AND reason = $2 ORDER BY created_at`, [
        userId,
        STREAK_MILESTONE_REASON,
      ])
    ).rows.map((r) => r.amount);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    wallet = new WalletService(pool);
    streaks = new StreakService(pool, wallet);
  });

  afterAll(async () => {
    await removeLearners(pool, `srp%${suffix}@it.kurda.app`);
    await pool.end();
    await app.close();
  });

  it('offers the streak that ended, and the day’s third session wins it back', async () => {
    const who = await learner();
    await seed(who.id, 12, '2026-03-07');

    // The 8th was missed: on the 9th the streak has ended and can be won back through the 11th.
    const ended = await streaks.get(who.id, 'UTC', at('2026-03-09'));
    expect(ended).toMatchObject({
      current: 0,
      longest: 12,
      repair: { days: 12, free: false, sessionsToday: 0, sessionsNeeded: STREAK_WIN_BACK_SESSIONS, until: '2026-03-12T00:00:00.000Z' },
      restored: null,
    });

    const one = await streaks.recordActivity(who.id, 'UTC', at('2026-03-09'));
    expect(one).toMatchObject({ current: 1, repair: { days: 12, sessionsToday: 1 } });
    const two = await streaks.recordActivity(who.id, 'UTC', at('2026-03-09'));
    expect(two).toMatchObject({ current: 1, repair: { sessionsToday: 2 } });
    const three = await streaks.recordActivity(who.id, 'UTC', at('2026-03-09'));
    expect(three).toMatchObject({ current: 13, longest: 13, lastActiveOn: '2026-03-09', repair: null, restored: { days: 12, on: '2026-03-09' } });
    expect(await repairs(who.id)).toEqual([{ ended: '2026-03-07', days: 12, cost: 0, free: false, won_back: true, on: '2026-03-09' }]);
    // never bought: nothing came out of the wallet
    const spent = await pool.query(`SELECT 1 FROM wallet_ledger WHERE user_id = $1 AND amount < 0`, [who.id]);
    expect(spent.rowCount).toBe(0);

    // the missed day is shown as a kept one, the way a frozen day is
    const week = await streaks.recent(who.id, 'UTC', at('2026-03-09'));
    expect(week.recent).toContainEqual({ date: '2026-03-08', kind: 'frozen' });
    // and a fourth session that day changes nothing more
    expect(await streaks.recordActivity(who.id, 'UTC', at('2026-03-09'))).toMatchObject({ current: 13, repair: null });
    expect((await streaks.recordActivity(who.id, 'UTC', at('2026-03-10'))).current).toBe(14);
  });

  it('counts sessions by the learner’s day, and not a game’s round', async () => {
    const who = await learner();
    await seed(who.id, 9, '2026-03-07');
    await learnTimes(who.id, '2026-03-09', 2);
    // a new day starts the count again
    expect(await streaks.recordActivity(who.id, 'UTC', at('2026-03-10'))).toMatchObject({ current: 2, repair: { sessionsToday: 1 } });
    // rounds of a learning game keep the streak but win nothing back
    for (let i = 0; i < 3; i++) await streaks.recordActivity(who.id, 'UTC', at('2026-03-10'), undefined, 'game');
    expect((await streaks.get(who.id, 'UTC', at('2026-03-10'))).repair).toMatchObject({ sessionsToday: 1 });
    expect(await streaks.recordActivity(who.id, 'UTC', at('2026-03-10'))).toMatchObject({ repair: { sessionsToday: 2 } });
    expect(await streaks.recordActivity(who.id, 'UTC', at('2026-03-10'))).toMatchObject({ current: 11, repair: null });
  });

  it('cannot be won back once the third day after it ended has passed', async () => {
    const who = await learner();
    await seed(who.id, 12, '2026-03-07');
    // ended on the 8th; the 11th is the last day, the 12th is too late
    expect((await streaks.get(who.id, 'UTC', at('2026-03-11'))).repair).toMatchObject({ days: 12 });
    expect((await streaks.get(who.id, 'UTC', at('2026-03-12'))).repair).toBeNull();
    expect(await learnTimes(who.id, '2026-03-12', 3)).toMatchObject({ current: 1, repair: null });
    expect(await repairs(who.id)).toEqual([]);
  });

  it('offers nothing for a streak shorter than three days, or a learner with none', async () => {
    const who = await learner();
    await seed(who.id, 2, '2026-03-07');
    expect((await streaks.get(who.id, 'UTC', at('2026-03-09'))).repair).toBeNull();
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'STREAK_TOO_SHORT', statusCode: 409 });
    expect(await learnTimes(who.id, '2026-03-09', 3)).toMatchObject({ current: 1 });

    const fresh = await learner();
    await expect(streaks.repair(fresh.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'NOTHING_TO_RESTORE', statusCode: 409 });
    const going = await learner();
    await seed(going.id, 12, '2026-03-08');
    await expect(streaks.repair(going.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'NOTHING_TO_RESTORE' });
  });

  it('tells anyone without a free restore to win it back, and changes nothing', async () => {
    const who = await learner();
    await seed(who.id, 12, '2026-03-07');
    await streaks.get(who.id, 'UTC', at('2026-03-09'));
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'WIN_IT_BACK', statusCode: 409 });
    expect(await row(who.id)).toMatchObject({ current: 0, ended: 12, restored: null });
    expect(await repairs(who.id)).toEqual([]);
    // a member whose membership has ended is told the same
    const lapsed = await learner();
    await plus(lapsed.id, '2026-03-01T00:00:00Z');
    await seed(lapsed.id, 12, '2026-03-07');
    expect((await streaks.get(lapsed.id, 'UTC', at('2026-03-09'))).repair).toMatchObject({ free: false });
    await expect(streaks.repair(lapsed.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'WIN_IT_BACK' });
  });

  it('gives a Hevalo+ member one free restore a calendar month, and the rest are won back', async () => {
    const who = await learner();
    await plus(who.id, '2030-01-01T00:00:00Z');

    await seed(who.id, 12, '2026-03-07');
    expect((await streaks.get(who.id, 'UTC', at('2026-03-09'))).repair).toMatchObject({ days: 12, free: true });
    const free = await streaks.repair(who.id, 'UTC', at('2026-03-09'));
    expect(free).toMatchObject({ restored: true, duplicate: false, days: 12, free: true });
    expect(free.streak).toMatchObject({ current: 12, lastActiveOn: '2026-03-08', repair: null });
    expect(await streaks.repair(who.id, 'UTC', at('2026-03-09'))).toMatchObject({ duplicate: true, free: true });

    // it ends again the same month: no free one left, so it is won back by learning
    await seed(who.id, 14, '2026-03-20');
    expect((await streaks.get(who.id, 'UTC', at('2026-03-22'))).repair).toMatchObject({ days: 14, free: false });
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-22'))).rejects.toMatchObject({ code: 'WIN_IT_BACK' });
    expect(await learnTimes(who.id, '2026-03-22', 3)).toMatchObject({ current: 15 });

    // and a new month has a free one again
    await seed(who.id, 20, '2026-04-02');
    expect(await streaks.repair(who.id, 'UTC', at('2026-04-04'))).toMatchObject({ free: true, duplicate: false });
    expect(await repairs(who.id)).toEqual([
      { ended: '2026-03-07', days: 12, cost: 0, free: true, won_back: false, on: '2026-03-09' },
      { ended: '2026-03-20', days: 14, cost: 0, free: false, won_back: true, on: '2026-03-22' },
      { ended: '2026-04-02', days: 20, cost: 0, free: true, won_back: false, on: '2026-04-04' },
    ]);
  });

  it('gives one free restore when a member’s requests arrive together', async () => {
    const who = await learner();
    await plus(who.id, '2030-01-01T00:00:00Z');
    await seed(who.id, 12, '2026-05-07');
    const results = await Promise.all(Array.from({ length: 8 }, () => streaks.repair(who.id, 'UTC', at('2026-05-09'))));
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(results.every((r) => r.free && r.streak.current === 12)).toBe(true);
    expect(await repairs(who.id)).toHaveLength(1);
  });

  it('keeps the offer by the learner’s own days, wherever they are', async () => {
    const who = await makeLearner(pool, `srp${n++}${suffix}`, { timezone: 'Asia/Baghdad' });
    await seed(who.id, 12, '2026-03-07');
    // 22:30 UTC on the 11th is already the 12th in Baghdad (UTC+3): the offer ended at their midnight
    const offer = (await streaks.get(who.id, 'Asia/Baghdad', new Date('2026-03-11T20:30:00Z'))).repair;
    expect(offer).toMatchObject({ days: 12, until: '2026-03-11T21:00:00.000Z' });
    expect((await streaks.get(who.id, 'Asia/Baghdad', new Date('2026-03-11T22:30:00Z'))).repair).toBeNull();
  });

  describe('milestones', () => {
    it('pays a member a streak reaching seven days, once, and nobody else anything', async () => {
      const who = await learner();
      await plus(who.id, '2030-01-01T00:00:00Z');
      await seed(who.id, 6, '2026-03-07');
      const seventh = await streaks.recordActivity(who.id, 'UTC', at('2026-03-08'));
      expect(seventh).toMatchObject({ current: 7, milestone: { days: 7, zer: 40 } });
      expect(await streaks.recordActivity(who.id, 'UTC', at('2026-03-08'))).toMatchObject({ milestone: null });
      expect(await milestonesPaid(who.id)).toEqual([40]);

      // someone not a member keeps the streak, earns nothing, and has nothing kept that would stop a later payment
      const free = await learner();
      await seed(free.id, 13, '2026-03-07');
      expect(await streaks.recordActivity(free.id, 'UTC', at('2026-03-08'))).toMatchObject({ current: 14, milestone: null });
      expect(await milestonesPaid(free.id)).toEqual([]);
      expect((await wallet.balances(free.id)).zer).toBe(0);
    });

    it('pays again only for a new streak reaching it sixty days or more after it last paid', async () => {
      const who = await learner();
      await plus(who.id, '2030-01-01T00:00:00Z');
      await seed(who.id, 6, '2026-03-07');
      await streaks.recordActivity(who.id, 'UTC', at('2026-03-08'));
      // broken, and a new streak reaches seven again a month later: nothing
      await seed(who.id, 6, '2026-04-06');
      expect(await streaks.recordActivity(who.id, 'UTC', at('2026-04-07'))).toMatchObject({ current: 7, milestone: null });
      // sixty days after it paid, it pays again
      await seed(who.id, 6, '2026-05-06');
      expect(await streaks.recordActivity(who.id, 'UTC', at('2026-05-07'))).toMatchObject({ current: 7, milestone: { days: 7, zer: 40 } });
      expect(await milestonesPaid(who.id)).toEqual([40, 40]);
    });

    it('pays the milestones a streak passes when it is won back', async () => {
      const who = await learner();
      await plus(who.id, '2030-01-01T00:00:00Z');
      await seed(who.id, 13, '2026-03-07');
      // the run was paid its seven days when it reached them
      await pool.query(`INSERT INTO streak_milestones (user_id, days, paid_on, zer) VALUES ($1, 7, '2026-03-01', 40)`, [who.id]);
      await streaks.get(who.id, 'UTC', at('2026-03-09'));
      // the run won back with today's day is 14 days long
      expect(await learnTimes(who.id, '2026-03-09', 3)).toMatchObject({ current: 14, milestone: { days: 14, zer: 60 } });
      expect(await milestonesPaid(who.id)).toEqual([60]);
    });

    it('pays nothing again for the milestones a long streak reached before it ended, won back or restored free', async () => {
      // A run of 100 days to the 1st of July, each milestone paid on the day the run reached it, some over sixty days ago.
      const reached: Array<[number, string, number]> = [
        [7, '2026-03-30', 40],
        [14, '2026-04-06', 60],
        [30, '2026-04-22', 120],
        [60, '2026-05-22', 150],
        [100, '2026-07-01', 250],
      ];
      const longRun = async () => {
        const who = await learner();
        await plus(who.id, '2030-01-01T00:00:00Z');
        await seed(who.id, 100, '2026-07-01');
        for (const [days, on, zer] of reached) {
          await pool.query(`INSERT INTO streak_milestones (user_id, days, paid_on, zer) VALUES ($1, $2, $3, $4)`, [who.id, days, on, zer]);
        }
        await streaks.get(who.id, 'UTC', at('2026-07-03'));
        return who;
      };

      const wonBack = await longRun();
      expect(await learnTimes(wonBack.id, '2026-07-03', 3)).toMatchObject({ current: 101, milestone: null });
      expect(await milestonesPaid(wonBack.id)).toEqual([]);

      const restored = await longRun();
      expect((await streaks.repair(restored.id, 'UTC', at('2026-07-03'))).duplicate).toBe(false);
      expect(await milestonesPaid(restored.id)).toEqual([]);
    });
  });

  describe('over HTTP', () => {
    let userId = '';
    let token = '';
    const call = (method: 'GET' | 'POST', url: string) =>
      app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.143.0.2' });

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: {
          email: `srp_http_${suffix}@it.kurda.app`,
          username: `srp_http_${suffix}`.slice(0, 30),
          password: 'a-strong-password1',
          acceptTerms: true,
          birthYear: 1990,
          birthMonth: 6,
        },
        remoteAddress: '10.143.0.1',
      });
      await activate(app, pool, res);
      userId = res.json().user.id;
      token = res.json().tokens.accessToken;
      await pool.query(`UPDATE users SET timezone = 'UTC' WHERE id = $1`, [userId]);
    });

    it('needs a session', async () => {
      const res = await app.inject({ method: 'POST', url: '/me/streak/repair', remoteAddress: '10.143.0.3' });
      expect(res.statusCode).toBe(401);
    });

    it('says the offer on GET /me/today, and tells anyone but a member with a free restore to win it back', async () => {
      const today = localDate(new Date(), 'UTC');
      await seed(userId, 6, shiftDate(today, -3)); // ended two days ago: today and tomorrow are left
      const streak = (await call('GET', '/me/today')).json().streak;
      const until = `${shiftDate(today, 2)}T00:00:00.000Z`;
      expect(streak).toMatchObject({ current: 0, repair: { days: 6, free: false, sessionsToday: 0, sessionsNeeded: 3, until } });

      const refused = await call('POST', '/me/streak/repair');
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ code: 'WIN_IT_BACK' });
    });

    it('restores a member’s streak free, by the server’s own day', async () => {
      const today = localDate(new Date(), 'UTC');
      await plus(userId, '2030-01-01T00:00:00Z');
      await seed(userId, 8, shiftDate(today, -2));
      const done = await call('POST', '/me/streak/repair');
      expect(done.statusCode).toBe(200);
      expect(done.json()).toMatchObject({ restored: true, duplicate: false, days: 8, free: true });
      expect(done.json().streak).toMatchObject({ current: 8, lastActiveOn: shiftDate(today, -1), repair: null });
      expect((await call('POST', '/me/streak/repair')).json()).toMatchObject({ duplicate: true });
    });
  });
});
