/**
 * Config-driven events (KUR-089). An event is a pure data definition — a time
 * window, a type, a quest set, a reward table, and a theme ref — so the product
 * team can launch holidays (Newroz etc.) without a code deploy. Activation is
 * derived from `starts_at`/`ends_at` at read time; overlapping events are
 * allowed and ordered by `priority` (higher first). `enabled` is a kill switch
 * for pulling a misconfigured event without editing its window.
 */

export const up = (pgm) => {
  pgm.createTable('events', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    key: { type: 'text', notNull: true, unique: true },
    name: { type: 'text', notNull: true },
    type: { type: 'text', notNull: true },
    starts_at: { type: 'timestamptz', notNull: true },
    ends_at: { type: 'timestamptz', notNull: true },
    priority: { type: 'integer', notNull: true, default: 0 },
    theme: { type: 'text' },
    quests: { type: 'jsonb', notNull: true, default: '[]' },
    rewards: { type: 'jsonb', notNull: true, default: '{}' },
    enabled: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('events', 'events_window_check', { check: 'ends_at > starts_at' });
  // active-window lookups scan by enabled + bounds
  pgm.createIndex('events', ['enabled', 'starts_at', 'ends_at']);
};

export const down = (pgm) => {
  pgm.dropTable('events');
};
