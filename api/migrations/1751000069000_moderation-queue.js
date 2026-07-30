/**
 * Unified moderation queue (KUR-102). One severity-sorted case per item across
 * every source — human chat reports (#086), anti-cheat reviews (#058), and the
 * automated flag tiers (text #293, image #294). `sync` ingests open items from
 * each source (idempotent via the UNIQUE (source, source_ref)); moderators
 * claim a case (claim-locking) and resolve it with one click (dismiss / warn /
 * mute / ban), which also closes the underlying source row. Resolution times
 * feed the SLA metric.
 */

export const up = (pgm) => {
  pgm.createTable('moderation_cases', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    source: {
      type: 'text',
      notNull: true,
      check: "source IN ('chat_report','anti_cheat','text_flag','image_flag')",
    },
    source_ref: { type: 'text', notNull: true },
    subject_user_id: { type: 'uuid' }, // no FK: some sources (image) have no user
    severity: { type: 'integer', notNull: true }, // 0–100, higher = more urgent
    summary: { type: 'text', notNull: true },
    evidence: { type: 'jsonb', notNull: true, default: '{}' },
    status: {
      type: 'text',
      notNull: true,
      default: 'open',
      check: "status IN ('open','claimed','resolved')",
    },
    claimed_by: { type: 'uuid' },
    claimed_at: { type: 'timestamptz' },
    resolution: { type: 'text', check: "resolution IN ('dismiss','warn','mute','ban')" },
    resolved_by: { type: 'uuid' },
    resolved_at: { type: 'timestamptz' },
    source_created_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint('moderation_cases', 'moderation_cases_source_ref_uniq', {
    unique: ['source', 'source_ref'],
  });
  // queue read: unresolved, most severe first, oldest first within a severity
  pgm.createIndex('moderation_cases', ['status', 'severity', 'source_created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('moderation_cases');
};
