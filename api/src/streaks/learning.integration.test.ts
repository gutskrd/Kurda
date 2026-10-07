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
import { StreakService } from './service.js';

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

  it('a daily Wordle win keeps the streak but is not a day learned', async () => {
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
});
