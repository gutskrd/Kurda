/**
 * Economy monitoring (KUR-074). economy_daily is the per-day rollup of currency
 * created (faucet) vs destroyed (sink) per currency, aggregated from the
 * append-only wallet_ledger. One row per (day, currency); the daily job upserts
 * so a re-run is idempotent. Feeds the supply chart + faucet/sink drift alerts.
 */

export const up = (pgm) => {
  pgm.createTable('economy_daily', {
    day: { type: 'date', notNull: true },
    currency: { type: 'text', notNull: true },
    faucet: { type: 'bigint', notNull: true, default: 0 },
    sink: { type: 'bigint', notNull: true, default: 0 },
    net: { type: 'bigint', notNull: true, default: 0 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('economy_daily', 'economy_daily_pkey', { primaryKey: ['day', 'currency'] });
  pgm.createIndex('economy_daily', ['currency', 'day']);
};

export const down = (pgm) => {
  pgm.dropTable('economy_daily');
};
