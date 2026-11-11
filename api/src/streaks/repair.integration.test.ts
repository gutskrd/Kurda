/**
 * Restoring a streak that ended (StreakService.repair, POST /me/streak/repair)
 * against real Postgres: what /me offers, what a restore charges and leaves on
 * the row, the ledger and the record, and every way it is refused — nothing to
 * restore, too short, too late, gems short, an account paused from rewards —
 * with a second request and a burst of them charging and restoring once.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { STREAK_REPAIR_COST_GEMS } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { makeLearner, removeLearners, type TestLearner } from '../test/progress.js';
import { WalletService } from '../wallet/service.js';
import { StreakService, STREAK_REPAIR_REASON } from './service.js';
import { localDate, shiftDate } from './streak-logic.js';

const DATABASE_URL = process.env.DATABASE_URL;

const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

describe.skipIf(!DATABASE_URL)('restoring a streak (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let wallet: WalletService;
  let streaks: StreakService;
  const suffix = Date.now().toString(36);
  let n = 0;

  const learner = (): Promise<TestLearner> => makeLearner(pool, `srp${n++}${suffix}`);

  /** A run of `days` whose last day was `lastActiveOn`, as the row held it before anything noticed it had ended. */
  const seed = (userId: string, days: number, lastActiveOn: string, freezes = 0) =>
    pool.query(
      `INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_active_on, freezes)
       VALUES ($1, $2, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         current_streak = EXCLUDED.current_streak, longest_streak = EXCLUDED.longest_streak,
         last_active_on = EXCLUDED.last_active_on, freezes = EXCLUDED.freezes,
         ended_streak = 0, ended_last_active_on = NULL, ended_restored_on = NULL`,
      [userId, days, lastActiveOn, freezes],
    );
  const gems = (userId: string, amount: number) =>
    wallet.credit({ userId, currency: 'gems', amount, reason: 'test_grant', idempotencyKey: `srp:${userId}:${Math.random()}` });
  const balance = async (userId: string) => (await wallet.balances(userId)).gems;
  const plus = (userId: string, until: string) => pool.query(`UPDATE users SET premium_until = $2 WHERE id = $1`, [userId, until]);
  const row = async (userId: string) =>
    (
      await pool.query<{ current: number; last: string; ended: number; ended_last: string | null; restored: string | null }>(
        `SELECT current_streak AS current, last_active_on::text AS last, ended_streak AS ended,
                ended_last_active_on::text AS ended_last, ended_restored_on::text AS restored
           FROM user_streaks WHERE user_id = $1`,
        [userId],
      )
    ).rows[0];
  const charges = async (userId: string) =>
    (await pool.query<{ amount: number }>(`SELECT amount FROM wallet_ledger WHERE user_id = $1 AND reason = $2`, [userId, STREAK_REPAIR_REASON])).rows.map(
      (r) => r.amount,
    );
  const repairs = async (userId: string) =>
    (
      await pool.query<{ ended: string; days: number; cost_gems: number; free: boolean; on: string }>(
        `SELECT ended_last_active_on::text AS ended, days, cost_gems, free, repaired_on::text AS on
           FROM streak_repairs WHERE user_id = $1 ORDER BY repaired_on`,
        [userId],
      )
    ).rows;

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

  it('offers the streak that ended, restores it for gems, and goes on from there', async () => {
    const who = await learner();
    await seed(who.id, 12, '2026-03-07');
    await gems(who.id, 60);

    // the 8th was missed: on the 9th the streak has ended and can be restored through the 11th
    const ended = await streaks.get(who.id, 'UTC', at('2026-03-09'));
    expect(ended).toMatchObject({ current: 0, longest: 12, repair: { days: 12, costGems: STREAK_REPAIR_COST_GEMS, free: false, until: '2026-03-12T00:00:00.000Z' } });
    expect(await row(who.id)).toEqual({ current: 0, last: '2026-03-07', ended: 12, ended_last: '2026-03-07', restored: null });

    const done = await streaks.repair(who.id, 'UTC', at('2026-03-09'));
    expect(done).toMatchObject({ restored: true, duplicate: false, days: 12, costGems: 50, free: false, gems: 10 });
    expect(done.streak).toMatchObject({ current: 12, lastActiveOn: '2026-03-08', repair: null });
    expect(await charges(who.id)).toEqual([-50]);
    expect(await repairs(who.id)).toEqual([{ ended: '2026-03-07', days: 12, cost_gems: 50, free: false, on: '2026-03-09' }]);
    expect(await wallet.verifyConsistency(who.id, 'gems')).toBe(true);

    // the missed day is shown as a kept one, the way a frozen day is, and is not a day learned
    const week = await streaks.recent(who.id, 'UTC', at('2026-03-09'));
    expect(week.recent).toContainEqual({ date: '2026-03-08', kind: 'frozen' });
    expect(done.streak.daysLearned).toBe(0);

    // a lesson today is the thirteenth day
    const next = await streaks.recordActivity(who.id, 'UTC', at('2026-03-09'));
    expect(next).toMatchObject({ current: 13, longest: 13, repair: null });
  });

  it('answers a second request as the first, charging and restoring once', async () => {
    const who = await learner();
    await seed(who.id, 5, '2026-03-07');
    await gems(who.id, 120);
    const first = await streaks.repair(who.id, 'UTC', at('2026-03-09'));
    const again = await streaks.repair(who.id, 'UTC', at('2026-03-09'));
    expect(first.duplicate).toBe(false);
    expect(again).toMatchObject({ restored: true, duplicate: true, days: 5, costGems: 50, free: false, gems: 70 });
    expect(again.streak).toMatchObject({ current: 5, repair: null });
    expect(await charges(who.id)).toEqual([-50]);
    expect(await repairs(who.id)).toHaveLength(1);
    // a retry the next day, after a lesson, still finds it done and leaves the run alone
    await streaks.recordActivity(who.id, 'UTC', at('2026-03-09'));
    const late = await streaks.repair(who.id, 'UTC', at('2026-03-10'));
    expect(late).toMatchObject({ duplicate: true, gems: 70 });
    expect(late.streak.current).toBe(6);
    // once the offer would have ended anyway there is nothing to restore
    for (const day of ['2026-03-10', '2026-03-11', '2026-03-12']) await streaks.recordActivity(who.id, 'UTC', at(day));
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-12'))).rejects.toMatchObject({ code: 'NOTHING_TO_RESTORE', statusCode: 409 });
    expect(await charges(who.id)).toEqual([-50]);
  });

  it('restores once under a burst of requests', async () => {
    const who = await learner();
    await seed(who.id, 30, '2026-03-07');
    await gems(who.id, 200); // enough for four: only one may be taken
    const results = await Promise.all(Array.from({ length: 12 }, () => streaks.repair(who.id, 'UTC', at('2026-03-09'))));
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(results.every((r) => r.restored && r.streak.current === 30)).toBe(true);
    expect(await balance(who.id)).toBe(150);
    expect(await charges(who.id)).toEqual([-50]);
    expect(await repairs(who.id)).toHaveLength(1);
    expect(await wallet.verifyConsistency(who.id, 'gems')).toBe(true);
  });

  it('is not undone by a read or a lesson racing it on the day the streak ended', async () => {
    const who = await learner();
    await seed(who.id, 9, '2026-03-07'); // nothing has noticed yet that it ended
    await gems(who.id, 50);
    await Promise.all([
      streaks.get(who.id, 'UTC', at('2026-03-09')),
      streaks.repair(who.id, 'UTC', at('2026-03-09')),
      streaks.get(who.id, 'UTC', at('2026-03-09')),
      streaks.recordPlayDay(who.id, 'UTC', at('2026-03-09')),
      streaks.get(who.id, 'UTC', at('2026-03-09')),
    ]);
    // whichever came first, the restore was paid for once and the run stands, today counted on top of it
    expect(await charges(who.id)).toEqual([-50]);
    const after = await streaks.get(who.id, 'UTC', at('2026-03-09'));
    expect(after).toMatchObject({ current: 10, lastActiveOn: '2026-03-09', repair: null });
  });

  it('does not lose a day learned after the streak ended', async () => {
    const who = await learner();
    await seed(who.id, 12, '2026-03-07');
    await gems(who.id, 50);
    // back on the 9th with a lesson before restoring: a new streak of one, the offer still there
    const back = await streaks.recordActivity(who.id, 'UTC', at('2026-03-09'));
    expect(back).toMatchObject({ current: 1, repair: { days: 12, costGems: 50 } });
    const done = await streaks.repair(who.id, 'UTC', at('2026-03-10'));
    expect(done.streak).toMatchObject({ current: 13, longest: 13, lastActiveOn: '2026-03-09', daysLearned: 1 });
    expect((await streaks.recordActivity(who.id, 'UTC', at('2026-03-10'))).current).toBe(14);
  });

  it('refuses once the third day after the streak ended has passed', async () => {
    const who = await learner();
    await seed(who.id, 12, '2026-03-07');
    await gems(who.id, 50);
    // ended on the 8th; the 11th is the last day, the 12th is too late
    expect((await streaks.get(who.id, 'UTC', at('2026-03-11'))).repair).toMatchObject({ days: 12 });
    expect((await streaks.get(who.id, 'UTC', at('2026-03-12'))).repair).toBeNull();
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-12'))).rejects.toMatchObject({ code: 'RESTORE_EXPIRED', statusCode: 409 });
    expect(await balance(who.id)).toBe(50);
    expect((await row(who.id))!.current).toBe(0);
    // and on its last day it still works
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-11'))).resolves.toMatchObject({ restored: true, duplicate: false });
  });

  it('refuses a streak nobody had noticed ending until it was too late', async () => {
    const who = await learner();
    await seed(who.id, 40, '2026-03-01');
    await gems(who.id, 50);
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-20'))).rejects.toMatchObject({ code: 'RESTORE_EXPIRED' });
    expect((await streaks.get(who.id, 'UTC', at('2026-03-20'))).repair).toBeNull();
    expect(await row(who.id)).toMatchObject({ current: 0, ended: 40, ended_last: '2026-03-01', restored: null });
  });

  it('offers nothing for a streak shorter than three days', async () => {
    const who = await learner();
    await seed(who.id, 2, '2026-03-07');
    await gems(who.id, 50);
    expect((await streaks.get(who.id, 'UTC', at('2026-03-09'))).repair).toBeNull();
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'STREAK_TOO_SHORT', statusCode: 409 });
    expect(await balance(who.id)).toBe(50);

    const three = await learner();
    await seed(three.id, 3, '2026-03-07');
    expect((await streaks.get(three.id, 'UTC', at('2026-03-09'))).repair).toMatchObject({ days: 3 });
  });

  it('has nothing to restore for a learner with no streak, or one that is going', async () => {
    const fresh = await learner();
    await gems(fresh.id, 50);
    expect((await streaks.get(fresh.id, 'UTC', at('2026-03-09'))).repair).toBeNull();
    await expect(streaks.repair(fresh.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'NOTHING_TO_RESTORE', statusCode: 409 });

    const going = await learner();
    await seed(going.id, 12, '2026-03-08');
    await gems(going.id, 50);
    await expect(streaks.repair(going.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'NOTHING_TO_RESTORE' });
    expect(await balance(going.id)).toBe(50);
    expect((await row(going.id))!.current).toBe(12);
  });

  it('refuses when the gems are short, and changes nothing', async () => {
    const who = await learner();
    await seed(who.id, 12, '2026-03-07');
    await gems(who.id, 49);
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS', statusCode: 402 });
    expect(await balance(who.id)).toBe(49);
    expect(await charges(who.id)).toEqual([]);
    expect(await repairs(who.id)).toEqual([]);
    // the offer is still there, and one more gem is enough
    expect((await streaks.get(who.id, 'UTC', at('2026-03-09'))).repair).toMatchObject({ days: 12, costGems: 50 });
    await gems(who.id, 1);
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-09'))).resolves.toMatchObject({ restored: true, gems: 0 });
  });

  it('gives a Hevalo+ member one free restore a calendar month, then charges', async () => {
    const who = await learner();
    await plus(who.id, '2027-01-01T00:00:00Z');
    await gems(who.id, 60);

    await seed(who.id, 12, '2026-03-07');
    expect((await streaks.get(who.id, 'UTC', at('2026-03-09'))).repair).toMatchObject({ days: 12, costGems: 0, free: true });
    const free = await streaks.repair(who.id, 'UTC', at('2026-03-09'));
    expect(free).toMatchObject({ restored: true, duplicate: false, costGems: 0, free: true, gems: 60 });
    expect(free.streak.current).toBe(12);
    expect(await charges(who.id)).toEqual([]);

    // it ends again the same month: this one has the price
    await seed(who.id, 14, '2026-03-20');
    expect((await streaks.get(who.id, 'UTC', at('2026-03-22'))).repair).toMatchObject({ days: 14, costGems: 50, free: false });
    const paid = await streaks.repair(who.id, 'UTC', at('2026-03-22'));
    expect(paid).toMatchObject({ duplicate: false, costGems: 50, free: false, gems: 10 });
    expect(await charges(who.id)).toEqual([-50]);

    // a third in the month, with the gems now short, is refused like anybody's
    await seed(who.id, 15, '2026-03-26');
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-28'))).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });

    // and a new month has a free one again
    await seed(who.id, 20, '2026-04-02');
    const april = await streaks.repair(who.id, 'UTC', at('2026-04-04'));
    expect(april).toMatchObject({ costGems: 0, free: true, gems: 10 });
    expect(await repairs(who.id)).toEqual([
      { ended: '2026-03-07', days: 12, cost_gems: 0, free: true, on: '2026-03-09' },
      { ended: '2026-03-20', days: 14, cost_gems: 50, free: false, on: '2026-03-22' },
      { ended: '2026-04-02', days: 20, cost_gems: 0, free: true, on: '2026-04-04' },
    ]);
  });

  it('charges a member whose membership has ended', async () => {
    const who = await learner();
    await plus(who.id, '2026-03-01T00:00:00Z');
    await seed(who.id, 12, '2026-03-07');
    expect((await streaks.get(who.id, 'UTC', at('2026-03-09'))).repair).toMatchObject({ costGems: 50, free: false });
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
  });

  it('gives one free restore when a member’s requests arrive together', async () => {
    const who = await learner();
    await plus(who.id, '2027-01-01T00:00:00Z');
    await seed(who.id, 12, '2026-05-07');
    const results = await Promise.all(Array.from({ length: 8 }, () => streaks.repair(who.id, 'UTC', at('2026-05-09'))));
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    expect(results.every((r) => r.free && r.costGems === 0)).toBe(true);
    expect(await repairs(who.id)).toHaveLength(1);
  });

  it('offers and restores nothing for an account paused from rewards', async () => {
    const who = await learner();
    await seed(who.id, 12, '2026-03-07');
    await gems(who.id, 50);
    await pool.query(`INSERT INTO account_holds (user_id, reason) VALUES ($1, 'VELOCITY')`, [who.id]);
    expect((await streaks.get(who.id, 'UTC', at('2026-03-09'))).repair).toBeNull();
    await expect(streaks.repair(who.id, 'UTC', at('2026-03-09'))).rejects.toMatchObject({ code: 'REWARDS_PAUSED', statusCode: 403 });
    expect(await balance(who.id)).toBe(50);
  });

  it('keeps the offer by the learner’s own days, wherever they are', async () => {
    const who = await makeLearner(pool, `srp${n++}${suffix}`, { timezone: 'Asia/Baghdad' });
    await seed(who.id, 12, '2026-03-07');
    await gems(who.id, 50);
    // 22:30 UTC on the 11th is already the 12th in Baghdad (UTC+3): the offer ended at their midnight
    const offer = (await streaks.get(who.id, 'Asia/Baghdad', new Date('2026-03-11T20:30:00Z'))).repair;
    expect(offer).toMatchObject({ days: 12, until: '2026-03-11T21:00:00.000Z' });
    expect((await streaks.get(who.id, 'Asia/Baghdad', new Date('2026-03-11T22:30:00Z'))).repair).toBeNull();
    await expect(streaks.repair(who.id, 'Asia/Baghdad', new Date('2026-03-11T22:30:00Z'))).rejects.toMatchObject({ code: 'RESTORE_EXPIRED' });
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

    it('GET /me carries the offer and POST /me/streak/repair takes it, by the server’s own day', async () => {
      const today = localDate(new Date(), 'UTC');
      await seed(userId, 8, shiftDate(today, -2));
      await gems(userId, 75);

      const none = await call('POST', '/me/streak/repair');
      // nothing is sent and nothing is needed: the first request is the restore itself
      expect(none.statusCode).toBe(200);
      expect(none.json()).toMatchObject({ restored: true, duplicate: false, days: 8, costGems: 50, free: false, gems: 25 });
      expect(none.json().streak).toMatchObject({ current: 8, lastActiveOn: shiftDate(today, -1), repair: null });

      const again = await call('POST', '/me/streak/repair');
      expect(again.statusCode).toBe(200);
      expect(again.json()).toMatchObject({ duplicate: true, gems: 25 });
      expect((await call('GET', '/me')).json().user.streak).toMatchObject({ current: 8, repair: null });
    });

    it('says the offer on GET /me, with the instant it ends, and refuses with a code when the gems are short', async () => {
      const today = localDate(new Date(), 'UTC');
      await seed(userId, 6, shiftDate(today, -3)); // ended two days ago: today and tomorrow are left
      const streak = (await call('GET', '/me')).json().user.streak;
      expect(streak).toMatchObject({ current: 0, repair: { days: 6, costGems: 50, free: false, until: `${shiftDate(today, 2)}T00:00:00.000Z` } });

      const short = await call('POST', '/me/streak/repair');
      expect(short.statusCode).toBe(402);
      expect(short.json()).toMatchObject({ code: 'INSUFFICIENT_FUNDS' });
      expect((await call('GET', '/me')).json().user.streak.repair).toMatchObject({ days: 6 });
    });

    it('refuses with a code when there is nothing to restore', async () => {
      const today = localDate(new Date(), 'UTC');
      await seed(userId, 6, today);
      const res = await call('POST', '/me/streak/repair');
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ code: 'NOTHING_TO_RESTORE' });
    });
  });
});
