import type pg from 'pg';
import {
  conversionRates,
  daysBefore,
  FUNNELS,
  RETENTION_DAYS,
  retentionRate,
  windowStart,
  type FunnelStepRate,
} from './dashboards.js';

/**
 * Format a pg `date` value (which node-postgres parses to a Date at *local*
 * midnight) back to YYYY-MM-DD without a timezone shift. `toISOString()` would
 * move the day on any server west/east of UTC; using the local components keeps
 * the calendar day pg gave us.
 */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface ActivityPoint {
  day: string;
  dau: number;
  wau: number;
  mau: number;
}

export interface RetentionPoint {
  cohortDay: string;
  dayN: number;
  cohortSize: number;
  retained: number;
  rate: number;
}

/**
 * Computes and serves the core dashboards (KUR-106). `refreshDay` is run by a
 * daily job: it materializes DAU/WAU/MAU, funnel step counts, and retention
 * cohorts into the rollup tables (counts only). The readers serve those rollups
 * by date range, so dashboards are cheap and survive user deletion.
 */
export class DashboardService {
  constructor(private readonly pool: pg.Pool) {}

  /** Recompute every rollup that "closes" on `day` (default: yesterday, UTC). */
  async refreshDay(day: string = daysBefore(new Date().toISOString().slice(0, 10), 1)): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // active-user counts over 1/7/30-day windows ending on `day`
      for (const [metric, win] of [['dau', 1], ['wau', 7], ['mau', 30]] as const) {
        const res = await client.query<{ n: string }>(
          `SELECT COUNT(DISTINCT user_id)::int AS n FROM analytics_events
           WHERE user_id IS NOT NULL AND day BETWEEN $1 AND $2`,
          [windowStart(day, win), day],
        );
        await this.upsertMetric(client, day, metric, Number(res.rows[0]?.n ?? 0));
      }

      // funnel step reach for the day (distinct users who fired each step's event)
      for (const [name, steps] of Object.entries(FUNNELS)) {
        for (const step of steps) {
          const res = await client.query<{ n: string }>(
            `SELECT COUNT(DISTINCT user_id)::int AS n FROM analytics_events
             WHERE user_id IS NOT NULL AND day = $1 AND type = $2`,
            [day, step],
          );
          await this.upsertMetric(client, day, `funnel.${name}.${step}`, Number(res.rows[0]?.n ?? 0));
        }
      }

      // retention cohorts maturing on `day`
      for (const dayN of RETENTION_DAYS) {
        const cohortDay = daysBefore(day, dayN);
        const res = await client.query<{ size: string; retained: string }>(
          `WITH firsts AS (SELECT user_id, MIN(day) AS fd FROM analytics_events WHERE user_id IS NOT NULL GROUP BY user_id),
                cohort AS (SELECT user_id FROM firsts WHERE fd = $1)
           SELECT (SELECT COUNT(*) FROM cohort)::int AS size,
                  (SELECT COUNT(DISTINCT e.user_id) FROM analytics_events e JOIN cohort c ON e.user_id = c.user_id
                   WHERE e.day = $2)::int AS retained`,
          [cohortDay, day],
        );
        await client.query(
          `INSERT INTO analytics_retention (cohort_day, day_n, cohort_size, retained)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (cohort_day, day_n) DO UPDATE SET cohort_size = EXCLUDED.cohort_size, retained = EXCLUDED.retained`,
          [cohortDay, dayN, Number(res.rows[0]?.size ?? 0), Number(res.rows[0]?.retained ?? 0)],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** DAU/WAU/MAU series over a date range. */
  async activity(from: string, to: string): Promise<ActivityPoint[]> {
    const res = await this.pool.query<{ day: Date; metric: string; value: number }>(
      `SELECT day, metric, value FROM analytics_daily_metrics
       WHERE metric IN ('dau','wau','mau') AND day BETWEEN $1 AND $2 ORDER BY day`,
      [from, to],
    );
    const byDay = new Map<string, ActivityPoint>();
    for (const r of res.rows) {
      const key = ymd(r.day);
      const point = byDay.get(key) ?? { day: key, dau: 0, wau: 0, mau: 0 };
      point[r.metric as 'dau' | 'wau' | 'mau'] = r.value;
      byDay.set(key, point);
    }
    return [...byDay.values()];
  }

  /** Funnel step totals + conversion rates over a range. */
  async funnel(name: string, from: string, to: string): Promise<FunnelStepRate[]> {
    const steps = FUNNELS[name];
    if (!steps) return [];
    const res = await this.pool.query<{ metric: string; total: string }>(
      `SELECT metric, SUM(value)::int AS total FROM analytics_daily_metrics
       WHERE metric LIKE $1 AND day BETWEEN $2 AND $3 GROUP BY metric`,
      [`funnel.${name}.%`, from, to],
    );
    const totals = new Map(res.rows.map((r) => [r.metric, Number(r.total)]));
    return conversionRates(steps.map((step) => ({ step, users: totals.get(`funnel.${name}.${step}`) ?? 0 })));
  }

  /** Retention cohorts (with rate) whose cohort day falls in the range. */
  async retention(from: string, to: string): Promise<RetentionPoint[]> {
    const res = await this.pool.query<{ cohort_day: Date; day_n: number; cohort_size: number; retained: number }>(
      `SELECT cohort_day, day_n, cohort_size, retained FROM analytics_retention
       WHERE cohort_day BETWEEN $1 AND $2 ORDER BY cohort_day, day_n`,
      [from, to],
    );
    return res.rows.map((r) => ({
      cohortDay: ymd(r.cohort_day),
      dayN: r.day_n,
      cohortSize: r.cohort_size,
      retained: r.retained,
      rate: retentionRate(r.cohort_size, r.retained),
    }));
  }

  private async upsertMetric(client: pg.PoolClient, day: string, metric: string, value: number): Promise<void> {
    await client.query(
      `INSERT INTO analytics_daily_metrics (day, metric, value) VALUES ($1, $2, $3)
       ON CONFLICT (day, metric) DO UPDATE SET value = EXCLUDED.value`,
      [day, metric, value],
    );
  }
}
