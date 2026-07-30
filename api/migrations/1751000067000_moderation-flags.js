/**
 * AI-assisted moderation flags (KUR-293). One row per automated moderation
 * decision above `allow` — the automated tier that feeds the human review queue
 * (#102) and is fully reversible (false-positive appeals). Stores the driving
 * category, score, the full per-category scores, and the model version for
 * auditability + threshold tuning (#104).
 */

export const up = (pgm) => {
  pgm.createTable('moderation_flags', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    surface: { type: 'text', notNull: true, check: "surface IN ('chat','library','caption','profile')" },
    content_type: { type: 'text', notNull: true }, // 'dm','comment','post','caption','profile'
    content_ref: { type: 'text' }, // id of the flagged content, when persisted
    author_id: { type: 'uuid', references: 'users', onDelete: 'CASCADE' },
    action: { type: 'text', notNull: true, check: "action IN ('flag','auto_hide','auto_block')" },
    top_category: { type: 'text' },
    top_score: { type: 'numeric(4,3)', notNull: true, default: 0 },
    scores: { type: 'jsonb', notNull: true, default: '{}' },
    model_version: { type: 'text', notNull: true },
    status: {
      type: 'text',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending','actioned','reversed')",
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    resolved_at: { type: 'timestamptz' },
    resolved_by: { type: 'uuid' }, // moderator; no FK so it outlives the account
  });

  // the review queue reads pending flags oldest-first
  pgm.createIndex('moderation_flags', ['status', 'created_at']);
  pgm.createIndex('moderation_flags', ['author_id', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('moderation_flags');
};
