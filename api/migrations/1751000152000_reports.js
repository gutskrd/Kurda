/**
 * One way to report anything, and cases that a re-report can reopen.
 *
 * Until now every surface had its own report table (`chat_reports`,
 * `library_reports`, `image_reports`, `user_reports`), none of them kept what
 * the reported thing said, and the queue rebuilt its cases from them on every
 * page load. Three things followed from that (see the moderation map):
 *
 *   - a report on a gotin (a post with no title) made the queue's summary NULL,
 *     broke the insert, and with it the whole queue, for everyone, for good;
 *   - a case, once closed, kept its key forever, so a new report about the same
 *     person or post never reached anyone again;
 *   - an author deleting the post deleted the report with it.
 *
 * `reports` is the one table every report now goes to. Each row carries an
 * immutable `evidence` snapshot taken by the server at report time — the text,
 * the author, the times, the media keys and, for chats, the messages around it —
 * so what the admin reads is what the reporter saw, whatever happens to the
 * content afterwards. The old tables stay, read-only, for their history.
 *
 * `moderation_cases` is extended rather than replaced: a priority (P0 most
 * urgent) and category from its reports, counts, a claim lease, a richer status,
 * and — the fix for the second bug — "one OPEN case per target" instead of "one
 * case per target ever": the unique key becomes a partial index over the open
 * statuses, so a report after a decision opens a new case.
 *
 * The reporter is kept as an id (nulled if the account is ever hard-deleted)
 * and as `reporter_hash`, a keyed pseudonym, so a reporter's accuracy can still
 * be counted after erasure without keeping who they were.
 */

const CATEGORIES = [
  'child_safety',
  'self_harm',
  'violence',
  'sexual',
  'hate',
  'private_info',
  'harassment',
  'spam',
  'impersonation',
  'other',
];
const TARGETS = [
  'user',
  'dm_message',
  'group_message',
  'group',
  'library_post',
  'library_comment',
  'image_post',
  'image_comment',
  'game_player',
];
const list = (values) => values.map((v) => `'${v}'`).join(',');

const OPEN = "status IN ('open','in_review','needs_second_approval','escalated')";
const STATUSES_NEW = "status IN ('open','in_review','actioned','no_violation','needs_second_approval','escalated')";
const STATUSES_OLD = "status IN ('open','claimed','resolved')";
const SOURCES_OLD =
  "source IN ('chat_report','anti_cheat','text_flag','image_flag','library_report','image_report','user_report')";
const SOURCES_NEW =
  "source IN ('report','chat_report','anti_cheat','text_flag','image_flag','bot_flag','library_report','image_report','user_report')";
const RESOLUTIONS_OLD = "resolution IN ('dismiss','warn','mute','ban','remove')";
const RESOLUTIONS_NEW = "resolution IN ('dismiss','warn','mute','ban','remove','actioned','no_violation','csam')";

export const up = (pgm) => {
  // ---- cases: the new statuses, with the old rows carried across ----------
  pgm.dropConstraint('moderation_cases', 'moderation_cases_status_check');
  pgm.sql(`UPDATE moderation_cases SET status = 'in_review' WHERE status = 'claimed'`);
  pgm.sql(
    `UPDATE moderation_cases
        SET status = CASE WHEN resolution = 'dismiss' THEN 'no_violation' ELSE 'actioned' END
      WHERE status = 'resolved'`,
  );
  pgm.addConstraint('moderation_cases', 'moderation_cases_status_check', { check: STATUSES_NEW });

  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_check', { check: SOURCES_NEW });
  pgm.dropConstraint('moderation_cases', 'moderation_cases_resolution_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_resolution_check', { check: RESOLUTIONS_NEW });

  pgm.addColumns('moderation_cases', {
    // 0 = P0 (a child at risk, self-harm, a threat) … 3 = P3 (spam)
    priority: { type: 'smallint', notNull: true, default: 3, check: 'priority BETWEEN 0 AND 3' },
    // the category of its most urgent report; null for feeds that have none (anti-cheat)
    category: { type: 'text', check: `category IS NULL OR category IN (${list(CATEGORIES)})` },
    target_type: { type: 'text' },
    target_id: { type: 'text' },
    report_count: { type: 'integer', notNull: true, default: 0 },
    reporter_count: { type: 'integer', notNull: true, default: 0 },
    // when the first and the latest report arrived — the SLA counts from the first
    first_reported_at: { type: 'timestamptz' },
    last_reported_at: { type: 'timestamptz' },
    // a claim holds the case for 15 minutes; claiming again refreshes it
    lease_until: { type: 'timestamptz' },
    resolution_note: { type: 'text' },
    // the rule a decision was made under
    policy: { type: 'text', check: `policy IS NULL OR policy IN (${list(CATEGORIES)})` },
    minor_involved: { type: 'boolean', notNull: true, default: false },
    // the decision asked for reporters to be told; kept for a decision that waits
    // for a second admin, so they are told once it is final
    notify_reporters: { type: 'boolean', notNull: true, default: false },
    // the P0 email went out (at most one per case)
    alert_sent_at: { type: 'timestamptz' },
    // what a removal changed, so an overturned appeal can put it back
    removed_content: { type: 'jsonb' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // the old rows: their timestamps, and a priority from the old 0–100 severity
  pgm.sql(
    `UPDATE moderation_cases
        SET first_reported_at = source_created_at,
            last_reported_at = source_created_at,
            priority = CASE WHEN severity >= 95 THEN 0 WHEN severity >= 80 THEN 1 WHEN severity >= 55 THEN 2 ELSE 3 END,
            lease_until = CASE WHEN status = 'in_review' THEN claimed_at + interval '15 minutes' END`,
  );
  pgm.alterColumn('moderation_cases', 'first_reported_at', { notNull: true, default: pgm.func('now()') });
  pgm.alterColumn('moderation_cases', 'last_reported_at', { notNull: true, default: pgm.func('now()') });

  // one OPEN case per target, not one case per target for ever
  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_ref_uniq');
  pgm.createIndex('moderation_cases', ['source', 'source_ref'], {
    name: 'moderation_cases_open_ref_uniq',
    unique: true,
    where: OPEN,
  });
  pgm.createIndex('moderation_cases', ['source', 'source_ref'], { name: 'moderation_cases_source_ref_idx' });

  // the queue reads open cases by priority, oldest first report first
  pgm.dropIndex('moderation_cases', ['status', 'severity', 'source_created_at']);
  pgm.createIndex('moderation_cases', ['status', 'priority', 'first_reported_at', 'id'], {
    name: 'moderation_cases_queue_idx',
  });
  pgm.createIndex('moderation_cases', 'subject_user_id', { name: 'moderation_cases_subject_idx' });

  // ---- reports ---------------------------------------------------------------
  pgm.createTable('reports', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    reporter_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    reporter_hash: { type: 'text', notNull: true },
    target_type: { type: 'text', notNull: true, check: `target_type IN (${list(TARGETS)})` },
    // text, not uuid: a game player is '<game>:<gameId>:<seat>'
    target_id: { type: 'text', notNull: true },
    subject_user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    category: { type: 'text', notNull: true, check: `category IN (${list(CATEGORIES)})` },
    priority: { type: 'smallint', notNull: true, check: 'priority BETWEEN 0 AND 3' },
    note: { type: 'text', check: 'note IS NULL OR char_length(note) <= 1000' },
    // the immutable snapshot taken at report time (see the comment above)
    evidence: { type: 'jsonb', notNull: true, default: '{}' },
    // a report from an account under a day old counts half when ordering
    weight: { type: 'numeric(3,2)', notNull: true, default: 1 },
    reporter_minor: { type: 'boolean', notNull: true, default: false },
    case_id: { type: 'uuid', references: 'moderation_cases', onDelete: 'SET NULL' },
    status: {
      type: 'text',
      notNull: true,
      default: 'open',
      check: "status IN ('open','actioned','no_violation')",
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    closed_at: { type: 'timestamptz' },
    evidence_pruned_at: { type: 'timestamptz' },
  });
  // the same person may report the same thing again only once their last report
  // about it is closed — a new incident, not the same one twice
  pgm.createIndex('reports', ['reporter_id', 'target_type', 'target_id'], {
    name: 'reports_one_open_per_target',
    unique: true,
    where: "status = 'open'",
  });
  pgm.createIndex('reports', 'case_id');
  // the daily limit and "My reports"
  pgm.createIndex('reports', ['reporter_id', 'created_at']);
  // a person's history in the case view
  pgm.createIndex('reports', ['subject_user_id', 'created_at']);
  pgm.createIndex('reports', ['reporter_hash', 'status']);
};

export const down = (pgm) => {
  pgm.dropTable('reports');

  pgm.dropIndex('moderation_cases', 'subject_user_id', { name: 'moderation_cases_subject_idx' });
  pgm.dropIndex('moderation_cases', ['status', 'priority', 'first_reported_at', 'id'], { name: 'moderation_cases_queue_idx' });
  pgm.createIndex('moderation_cases', ['status', 'severity', 'source_created_at']);
  pgm.dropIndex('moderation_cases', ['source', 'source_ref'], { name: 'moderation_cases_source_ref_idx' });
  pgm.dropIndex('moderation_cases', ['source', 'source_ref'], { name: 'moderation_cases_open_ref_uniq' });

  // cases the old schema cannot hold: report cases and bot flags, and every
  // closed duplicate a re-report created (the old key allowed one case per target)
  pgm.sql(`DELETE FROM moderation_cases WHERE source IN ('report','bot_flag')`);
  pgm.sql(
    `DELETE FROM moderation_cases c
      WHERE EXISTS (SELECT 1 FROM moderation_cases n
                     WHERE n.source = c.source AND n.source_ref = c.source_ref AND n.created_at > c.created_at)`,
  );
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_ref_uniq', { unique: ['source', 'source_ref'] });

  pgm.dropColumns('moderation_cases', [
    'priority',
    'category',
    'target_type',
    'target_id',
    'report_count',
    'reporter_count',
    'first_reported_at',
    'last_reported_at',
    'lease_until',
    'resolution_note',
    'policy',
    'minor_involved',
    'notify_reporters',
    'alert_sent_at',
    'removed_content',
    'updated_at',
  ]);

  pgm.dropConstraint('moderation_cases', 'moderation_cases_resolution_check');
  pgm.sql(`UPDATE moderation_cases SET resolution = 'dismiss' WHERE resolution = 'no_violation'`);
  pgm.sql(`UPDATE moderation_cases SET resolution = 'ban' WHERE resolution = 'csam'`);
  pgm.sql(`UPDATE moderation_cases SET resolution = 'warn' WHERE resolution = 'actioned'`);
  pgm.addConstraint('moderation_cases', 'moderation_cases_resolution_check', { check: RESOLUTIONS_OLD });
  pgm.dropConstraint('moderation_cases', 'moderation_cases_source_check');
  pgm.addConstraint('moderation_cases', 'moderation_cases_source_check', { check: SOURCES_OLD });

  pgm.dropConstraint('moderation_cases', 'moderation_cases_status_check');
  pgm.sql(`UPDATE moderation_cases SET status = 'claimed' WHERE status = 'in_review'`);
  pgm.sql(`UPDATE moderation_cases SET status = 'open' WHERE status IN ('needs_second_approval','escalated')`);
  pgm.sql(`UPDATE moderation_cases SET status = 'resolved' WHERE status IN ('actioned','no_violation')`);
  pgm.addConstraint('moderation_cases', 'moderation_cases_status_check', { check: STATUSES_OLD });
};
