/** A/B experiments (KUR-107) against real Postgres: assignment, exposure, kill switch. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { AnalyticsService } from '../analytics/service.js';
import { ExperimentService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('experiments (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let experiments: ExperimentService;
  const suffix = Date.now().toString(36);
  const testKey = `it_exp_${suffix}`;
  let userId = '';

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    experiments = new ExperimentService(pool, new AnalyticsService(pool));
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `exp_${suffix}@it.kurda.app`, username: `exp_${suffix}`.slice(0, 30), password: 'a-strong-password', acceptTerms: true },
      remoteAddress: '10.107.0.1',
    });
    userId = res.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`); // cascades analytics_events
    await pool.query(`DELETE FROM experiments WHERE key = $1`, [testKey]);
    await pool.end();
    await app.close();
  });

  it('ships the pilot experiment and assigns deterministically', async () => {
    const pilot = await experiments.byKey('daily_goal_default');
    expect(pilot?.enabled).toBe(true);
    expect(pilot?.variants.map((v) => v.key).sort()).toEqual(['control', 'variant_b']);

    const first = await experiments.variant(userId, 'daily_goal_default');
    expect(['control', 'variant_b']).toContain(first);
    // same user → same variant every time (across devices/reinstalls)
    for (let i = 0; i < 3; i++) expect(await experiments.variant(userId, 'daily_goal_default')).toBe(first);
  });

  it('logs an idempotent exposure event', async () => {
    await experiments.variant(userId, 'daily_goal_default');
    await experiments.variant(userId, 'daily_goal_default'); // repeat
    const res = await pool.query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM analytics_events
       WHERE user_id = $1 AND type = 'experiment_exposure' AND payload->>'experiment' = 'daily_goal_default'`,
      [userId],
    );
    expect(Number(res.rows[0]!.n)).toBe(1); // deduped despite repeated exposure
  });

  it('kill switch resolves everyone to control', async () => {
    expect(await experiments.setEnabled('daily_goal_default', false)).toBe(true);
    expect(await experiments.variant(userId, 'daily_goal_default')).toBe('control');
    await experiments.setEnabled('daily_goal_default', true); // restore
  });

  it('unknown experiments resolve to control', async () => {
    expect(await experiments.variant(userId, 'no_such_experiment')).toBe('control');
  });

  it('admin can create and bulk-fetch assignments', async () => {
    await experiments.upsert({ key: testKey, variants: [{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }] });
    const all = await experiments.assignmentsFor(userId);
    expect(Object.keys(all)).toContain(testKey);
    expect(['a', 'b']).toContain(all[testKey]);
  });
});
