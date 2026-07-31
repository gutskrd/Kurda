/**
 * Community library moderation (KUR-285). Users report posts/comments (text or
 * audio) with a reason; reports feed the unified moderation queue (#102), which
 * gains a `library_report` source and a `remove` resolution (soft-delete the
 * reported content). One report per user per item; mass-reports of one item
 * collapse to a single queue case (dedup by target in the queue sync).
 */

export const up = (pgm) => {
  pgm.createTable('library_reports', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    target_type: { type: 'text', notNull: true, check: "target_type IN ('library_post','library_comment')" },
    target_id: { type: 'uuid', notNull: true },
    reporter_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    reason: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'open', check: "status IN ('open','resolved')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // one report per user per item (re-reporting is a no-op)
  pgm.addConstraint('library_reports', 'library_reports_uniq', { unique: ['target_type', 'target_id', 'reporter_id'] });
  pgm.createIndex('library_reports', ['target_type', 'target_id', 'status']);

  // extend the unified queue (#102): new source + a content-removal resolution
  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_check', {
    check: "source IN ('chat_report','anti_cheat','text_flag','image_flag','library_report')",
  });
  pgm.dropConstraint('moderation_cases', 'moderation_cases_resolution_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_resolution_check', {
    check: "resolution IN ('dismiss','warn','mute','ban','remove')",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('moderation_cases', 'moderation_cases_resolution_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_resolution_check', {
    check: "resolution IN ('dismiss','warn','mute','ban')",
  });
  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_check', {
    check: "source IN ('chat_report','anti_cheat','text_flag','image_flag')",
  });
  pgm.dropTable('library_reports');
};
