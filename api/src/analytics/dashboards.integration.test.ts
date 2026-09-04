/** Core dashboards (KUR-106) against real Postgres: DAU, retention, funnel. */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { DashboardService } from './dashboard-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('dashboards (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let dashboards: DashboardService;
  const suffix = Date.now().toString(36);
  const D0 = '2026-06-01';
  const D1 = '2026-06-02';
  let u1 = '';
  let u2 = '';

  async function reg(name: string, ip: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `${name}_${suffix}@it.kurda.app`, username: name.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: ip,
    });
    return res.json().user.id;
  }

  const insert = (userId: string, type: string, day: string) =>
    pool.query(
      `INSERT INTO analytics_events (event_id, user_id, type, payload, day) VALUES ($1, $2, $3, '{}'::jsonb, $4)`,
      [randomUUID(), userId, type, day],
    );

  /** Active-user history now comes from the heartbeat's per-day rows, not events. */
  const active = (userId: string, day: string) =>
    pool.query(`INSERT INTO user_activity_days (day, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [day, userId]);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    dashboards = new DashboardService(pool);
    u1 = await reg(`dashu1_${suffix}`, '10.106.0.1');
    u2 = await reg(`dashu2_${suffix}`, '10.106.0.2');

    // D0: both users onboard (u1 completes, u2 stops at lesson_start)
    await insert(u1, 'screen_view', D0);
    await insert(u1, 'lesson_start', D0);
    await insert(u1, 'lesson_complete', D0);
    await insert(u2, 'screen_view', D0);
    await insert(u2, 'lesson_start', D0);
    // D1: only u1 returns
    await insert(u1, 'lesson_start', D1);

    // Activity + retention read server-side truth now: per-day activity rows, and
    // cohorts by signup date — so place both accounts' signup on D0.
    await pool.query(`UPDATE users SET created_at = $1::date WHERE id = ANY($2)`, [D0, [u1, u2]]);
    await active(u1, D0);
    await active(u2, D0);
    await active(u1, D1);

    await dashboards.refreshDay(D0);
    await dashboards.refreshDay(D1);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`); // cascades analytics_events
    await pool.query(`DELETE FROM analytics_daily_metrics WHERE day IN ($1, $2)`, [D0, D1]);
    await pool.query(`DELETE FROM analytics_retention WHERE cohort_day = $1`, [D0]);
    await pool.end();
    await app.close();
  });

  it('computes DAU across days', async () => {
    const points = await dashboards.activity(D0, D1);
    expect(points.find((p) => p.day === D0)!.dau).toBe(2);
    expect(points.find((p) => p.day === D1)!.dau).toBe(1);
  });

  it('computes the onboarding funnel with conversion rates', async () => {
    const steps = await dashboards.funnel('onboarding', D0, D0);
    const byStep = Object.fromEntries(steps.map((s) => [s.step, s]));
    expect(byStep.screen_view!.users).toBe(2);
    expect(byStep.lesson_start!.users).toBe(2);
    expect(byStep.lesson_complete!.users).toBe(1);
    expect(byStep.lesson_complete!.rateFromPrev).toBe(0.5); // 1 of 2 who started completed
  });

  it('computes D1 retention for the D0 cohort', async () => {
    const cohorts = await dashboards.retention(D0, D0);
    const d1 = cohorts.find((c) => c.dayN === 1)!;
    expect(d1.cohortSize).toBe(2); // both first seen on D0
    expect(d1.retained).toBe(1); // only u1 returned on D1
    expect(d1.rate).toBe(0.5);
  });

  it('rollups survive deletion of the underlying user (GDPR)', async () => {
    // remove u2's raw activity; the already-computed D0 cohort size stays 2
    await pool.query(`DELETE FROM user_activity_days WHERE user_id = $1`, [u2]);
    const cohorts = await dashboards.retention(D0, D0);
    expect(cohorts.find((c) => c.dayN === 1)!.cohortSize).toBe(2);
  });
});
