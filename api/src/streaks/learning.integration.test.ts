/**
 * Days learned and freezes earned by learning (StreakService) against real
 * Postgres: what a run of finished sessions leaves on the row, and what /me
 * shows of it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { makeLearner } from '../test/progress.js';
import { StreakService } from './service.js';
import { localDate, shiftDate } from './streak-logic.js';

const DATABASE_URL = process.env.DATABASE_URL;

const at = (iso: string): Date => new Date(`${iso}T12:00:00Z`);

describe.skipIf(!DATABASE_URL)('learning streak (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let streaks: StreakService;
  const suffix = Date.now().toString(36);
  let userId = '';
  let token = '';

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    streaks = new StreakService(pool);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `learn_${suffix}@it.kurda.app`,
        username: `learn_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.142.0.1',
    });
    await activate(app, pool, res);
    userId = res.json().user.id;
    token = res.json().tokens.accessToken;
    await pool.query(`UPDATE users SET timezone = 'UTC' WHERE id = $1`, [userId]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('earns a freeze with the fifth finished session, and keeps it', async () => {
    for (const day of ['2026-05-01', '2026-05-02', '2026-05-02', '2026-05-03']) {
      await streaks.recordActivity(userId, 'UTC', at(day));
    }
    const fifth = await streaks.recordActivity(userId, 'UTC', at('2026-05-04'));
    expect(fifth).toMatchObject({ current: 4, freezes: 1, freezeProgress: 0, daysLearned: 4 });

    const row = await pool.query(
      `SELECT freezes, freeze_progress, days_learned, last_learned_on::text AS last FROM user_streaks WHERE user_id = $1`,
      [userId],
    );
    expect(row.rows[0]).toEqual({ freezes: 1, freeze_progress: 0, days_learned: 4, last: '2026-05-04' });
  });

  it('a daily Peyvok win keeps the streak but is not a day learned', async () => {
    const played = await streaks.recordPlayDay(userId, 'UTC', at('2026-05-05'));
    expect(played).toMatchObject({ current: 5, daysLearned: 4, freezeProgress: 0 });
    expect(await streaks.lastLearnedOn(userId)).toBe('2026-05-04');
  });

  it('/me shows the longest streak and the days learned beside the current one', async () => {
    // the run lapses (two days missed, one freeze spends on the first)…
    await streaks.recordActivity(userId, 'UTC', at('2026-05-09'));
    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.142.0.2',
    });
    // …so the current streak starts again while the other two keep what was done
    expect(me.json().user.streak).toMatchObject({ longest: 5, daysLearned: 5 });
    expect(me.json().user.streak.current).toBeLessThanOrEqual(1);
  });

  it('/me says which day a freeze kept, once it has spent one', async () => {
    const today = localDate(new Date(), 'UTC');
    await pool.query(`UPDATE user_streaks SET current_streak = 3, last_active_on = $2, freezes = 1, freeze_used_on = NULL WHERE user_id = $1`, [
      userId,
      shiftDate(today, -2),
    ]);
    const me = () =>
      app.inject({ method: 'GET', url: '/me', headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.142.0.2' });
    const kept = (await me()).json().user.streak;
    expect(kept).toMatchObject({ current: 3, freezes: 0, maxFreezes: 1, freezeUsedOn: shiftDate(today, -1), lastActiveOn: shiftDate(today, -1) });
    // read again, the same day stays: it is what an app compares with the one it last said
    expect((await me()).json().user.streak.freezeUsedOn).toBe(shiftDate(today, -1));
    // and a lesson after it keeps it too
    const after = await streaks.recordActivity(userId, 'UTC');
    expect(after).toMatchObject({ current: 4, freezeUsedOn: shiftDate(today, -1) });
  });

  /** Ten sessions, one a day from the 1st of August: enough learning for two freezes, if there is room for two. */
  const tenDays = async (id: string) => {
    let last = await streaks.recordActivity(id, 'UTC', at('2026-08-01'));
    for (let i = 1; i < 10; i++) last = await streaks.recordActivity(id, 'UTC', at(shiftDate('2026-08-01', i)));
    return last;
  };

  it('holds one freeze without Hevalo+, however much is learned', async () => {
    const who = await makeLearner(pool, `learn_one_${suffix}`);
    expect(await tenDays(who.id)).toMatchObject({ current: 10, freezes: 1, maxFreezes: 1, freezeProgress: 5 });
  });

  it('a Hevalo+ member earns and holds a second freeze, and two missed days in a row are both kept', async () => {
    const who = await makeLearner(pool, `learn_plus_${suffix}`);
    await pool.query(`UPDATE users SET premium_until = '2027-01-01T00:00:00Z' WHERE id = $1`, [who.id]);
    expect(await tenDays(who.id)).toMatchObject({ current: 10, freezes: 2, maxFreezes: 2, freezeProgress: 0 });

    // the 11th and the 12th missed, seen again on the 13th: both freezes spent, the run kept
    const kept = await streaks.get(who.id, 'UTC', at('2026-08-13'));
    expect(kept).toMatchObject({ current: 10, freezes: 0, maxFreezes: 2, freezeUsedOn: '2026-08-12', lastActiveOn: '2026-08-12', repair: null });
    const week = await streaks.recent(who.id, 'UTC', at('2026-08-13'));
    expect(week.recent).toEqual([
      { date: '2026-08-11', kind: 'frozen' },
      { date: '2026-08-12', kind: 'frozen' },
    ]);
    expect((await streaks.recordActivity(who.id, 'UTC', at('2026-08-13'))).current).toBe(11);
  });

  it('keeps a second freeze after membership ends, and earns no more while holding it', async () => {
    const who = await makeLearner(pool, `learn_lapsed_${suffix}`);
    await pool.query(`UPDATE users SET premium_until = '2026-08-10T23:00:00Z' WHERE id = $1`, [who.id]);
    expect(await tenDays(who.id)).toMatchObject({ freezes: 2, maxFreezes: 2 });
    // membership over: the two held are still there and still drawn, and five more sessions add none
    let after = await streaks.get(who.id, 'UTC', at('2026-08-11'));
    expect(after).toMatchObject({ freezes: 2, maxFreezes: 2 });
    for (let i = 0; i < 5; i++) after = await streaks.recordActivity(who.id, 'UTC', at('2026-08-11'));
    expect(after).toMatchObject({ current: 11, freezes: 2, maxFreezes: 2, freezeProgress: 5 });
  });
});
