/**
 * Chat moderation (KUR-086). chat_reports is the moderation queue — a reported
 * message plus the surrounding context captured at report time. chat_offenses
 * tracks flagged-message counts per user for repeat-offender auto-mute
 * escalation (1h → 24h → permanent), a global chat mute enforced on send.
 */

export const up = (pgm) => {
  pgm.createTable('chat_reports', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    reporter_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    reported_user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    message_type: { type: 'text', notNull: true },
    message_id: { type: 'uuid', notNull: true },
    /** the reported message + ~10 surrounding messages, frozen at report time */
    context: { type: 'jsonb', notNull: true },
    reason: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'open' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    reviewed_at: { type: 'timestamptz' },
    reviewed_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
  });
  pgm.addConstraint('chat_reports', 'chat_reports_type_check', { check: "message_type IN ('dm','group')" });
  pgm.addConstraint('chat_reports', 'chat_reports_status_check', {
    check: "status IN ('open','actioned','dismissed')",
  });
  pgm.createIndex('chat_reports', ['status', 'created_at']);

  pgm.createTable('chat_offenses', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    offense_count: { type: 'integer', notNull: true, default: 0 },
    muted_until: { type: 'timestamptz' },
    perm_muted: { type: 'boolean', notNull: true, default: false },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

export const down = (pgm) => {
  pgm.dropTable('chat_offenses');
  pgm.dropTable('chat_reports');
};
