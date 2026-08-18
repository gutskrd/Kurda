/**
 * Image/meme moderation reports (KUR-292). Users report an image post or a
 * comment on one; reports feed the unified moderation queue (#102), which gains
 * an `image_report` source and reuses the `remove` resolution to soft-delete the
 * reported content. One report per user per item (re-reporting is a no-op);
 * mass-reports of one item collapse to a single queue case (dedup by target).
 *
 * NSFW safeguard note: auto image scanning (#294) already gates suspicious images
 * at upload — only a `cleared` image is ever stored/confirmed/served — so this
 * layer handles user-surfaced reports on top of that automatic screen.
 */

export const up = (pgm) => {
  pgm.createTable('image_reports', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    target_type: { type: 'text', notNull: true, check: "target_type IN ('image_post','image_comment')" },
    target_id: { type: 'uuid', notNull: true },
    reporter_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    reason: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'open', check: "status IN ('open','resolved')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // one report per user per item (re-reporting is a no-op)
  pgm.addConstraint('image_reports', 'image_reports_uniq', { unique: ['target_type', 'target_id', 'reporter_id'] });
  pgm.createIndex('image_reports', ['target_type', 'target_id', 'status']);

  // extend the unified queue (#102) with the image_report source
  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_check', {
    check: "source IN ('chat_report','anti_cheat','text_flag','image_flag','library_report','image_report')",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_check', {
    check: "source IN ('chat_report','anti_cheat','text_flag','image_flag','library_report')",
  });
  pgm.dropTable('image_reports');
};
