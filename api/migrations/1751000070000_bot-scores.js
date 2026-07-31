/**
 * Behavioral bot detection scores (KUR-110). One row per user: the latest
 * suspicion score + tier from the scoring job, the contributing signals (for
 * tuning + appeal), and the review lifecycle. `challenge` gates an invisible
 * CAPTCHA on the next session; `flagged` marks a high-confidence bot whose
 * XP/currency gains are reversal candidates until a human confirms or clears.
 */

export const up = (pgm) => {
  pgm.createTable('bot_scores', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    score: { type: 'numeric(4,3)', notNull: true },
    tier: { type: 'text', notNull: true, check: "tier IN ('clear','challenge','flagged')" },
    signals: { type: 'jsonb', notNull: true, default: '{}' },
    challenge: { type: 'boolean', notNull: true, default: false },
    flagged: { type: 'boolean', notNull: true, default: false },
    // active = auto verdict standing; confirmed = human-confirmed bot (reversed);
    // cleared = human-cleared false positive
    status: {
      type: 'text',
      notNull: true,
      default: 'active',
      check: "status IN ('active','confirmed','cleared')",
    },
    computed_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    resolved_at: { type: 'timestamptz' },
    resolved_by: { type: 'uuid' },
  });

  // admin review feed: flagged + still active, most suspicious first
  pgm.createIndex('bot_scores', ['flagged', 'status', 'score']);
};

export const down = (pgm) => {
  pgm.dropTable('bot_scores');
};
