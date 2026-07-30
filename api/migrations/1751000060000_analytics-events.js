/**
 * Analytics event store (KUR-105). One row per behavioral event, keyed by a
 * client-generated `event_id` (unique) so a retried/offline-replayed batch
 * dedupes on ingest. `client_ts` is when the device recorded it, `received_at`
 * when the server accepted it, and `day` is the daily partition key the
 * dashboards (KUR-106) aggregate over. `payload` is pre-validated against the
 * schema registry, so unknown/malformed events never land here.
 */

export const up = (pgm) => {
  pgm.createTable('analytics_events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    event_id: { type: 'text', notNull: true, unique: true }, // client-generated → dedupe
    user_id: { type: 'uuid', references: 'users', onDelete: 'CASCADE' },
    type: { type: 'text', notNull: true },
    payload: { type: 'jsonb', notNull: true },
    client_ts: { type: 'timestamptz' },
    received_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    day: { type: 'date', notNull: true, default: pgm.func('current_date') },
  });
  // dashboards scan by day + type; user funnels scan by user
  pgm.createIndex('analytics_events', ['day', 'type']);
  pgm.createIndex('analytics_events', ['user_id', 'received_at']);
};

export const down = (pgm) => {
  pgm.dropTable('analytics_events');
};
