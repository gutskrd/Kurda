/**
 * Anti-cheat (KUR-058). cheat_stats accumulates each player's server-measured
 * answer behaviour across games; cheat_reviews logs flagged games with full
 * timing evidence for human review (shadow_flagged at high confidence). No
 * penalties are applied automatically — a human reviews first.
 */

export const up = (pgm) => {
  pgm.createTable('cheat_stats', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    questions_answered: { type: 'integer', notNull: true, default: 0 },
    correct_count: { type: 'integer', notNull: true, default: 0 },
    fast_count: { type: 'integer', notNull: true, default: 0 },
    impossible_count: { type: 'integer', notNull: true, default: 0 },
    rtt_anomaly_count: { type: 'integer', notNull: true, default: 0 },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('cheat_reviews', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    room_id: { type: 'text', notNull: true },
    flags: { type: 'jsonb', notNull: true },
    /** the triggering game's per-question timing evidence */
    evidence: { type: 'jsonb', notNull: true },
    confidence: { type: 'real', notNull: true },
    shadow_flagged: { type: 'boolean', notNull: true, default: false },
    reviewed: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('cheat_reviews', ['reviewed', 'created_at']);
  pgm.createIndex('cheat_reviews', 'user_id');
};

export const down = (pgm) => {
  pgm.dropTable('cheat_reviews');
  pgm.dropTable('cheat_stats');
};
