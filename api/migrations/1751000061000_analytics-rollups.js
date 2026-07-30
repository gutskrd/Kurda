/**
 * Analytics rollup tables (KUR-106). Daily-refreshed aggregates over
 * analytics_events (KUR-105), storing COUNTS ONLY — no user ids, no PII. Because
 * the numbers are materialized here, they remain correct after a user is deleted
 * or anonymized (their raw events cascade away, but history stays intact).
 */

export const up = (pgm) => {
  // scalar daily metrics: 'dau', 'wau', 'mau', 'funnel.<name>.<step>'
  pgm.createTable('analytics_daily_metrics', {
    day: { type: 'date', notNull: true },
    metric: { type: 'text', notNull: true },
    value: { type: 'integer', notNull: true, default: 0 },
  });
  pgm.addConstraint('analytics_daily_metrics', 'analytics_daily_metrics_pkey', { primaryKey: ['day', 'metric'] });

  // retention cohorts: of users first seen on cohort_day, how many returned on day cohort_day + day_n
  pgm.createTable('analytics_retention', {
    cohort_day: { type: 'date', notNull: true },
    day_n: { type: 'integer', notNull: true },
    cohort_size: { type: 'integer', notNull: true, default: 0 },
    retained: { type: 'integer', notNull: true, default: 0 },
  });
  pgm.addConstraint('analytics_retention', 'analytics_retention_pkey', { primaryKey: ['cohort_day', 'day_n'] });
};

export const down = (pgm) => {
  pgm.dropTable('analytics_retention');
  pgm.dropTable('analytics_daily_metrics');
};
