/**
 * What moderation leaves behind must outlive the people in it.
 *
 * Several moderation tables deleted their rows with an account: the audit of
 * admin actions (`admin_actions`, CASCADE on the person acted on), the old
 * report tables (CASCADE on the reporter, and on the reported person for
 * `user_reports`), and the automated text flags. An offender could erase the
 * evidence by deleting their account, and a reporter's history vanished with
 * theirs. Accounts are anonymised rather than deleted today, but the schema
 * should not depend on that: these become SET NULL, and `admin_actions` gains a
 * keyed pseudonym so the history stays countable.
 *
 * `admin_actions` also becomes the decision log the case view reads: which case,
 * which rule, what the person was told, and the state before and after. Its
 * list of actions grows with the new decisions (and the item grant/revoke rows
 * the user admin already writes, which the old list did not allow).
 *
 * Chat messages gain `moderated_at`/`moderated_by`: a message Hevalo removes is
 * replaced for both people by "Removed by Hevalo", while the report's snapshot
 * keeps what it said.
 *
 * Media gains `preserve_evidence`: a key in a report's snapshot is kept by every
 * cleanup (the orphan sweep, a replaced profile photo, a closed account's files)
 * until the evidence's retention ends.
 */

const ACTIONS_OLD =
  "action IN ('warn', 'mute', 'temp_ban', 'perm_ban', 'unban', 'wallet_adjust', 'auto_mute', 'auto_suspend')";
const ACTIONS_NEW = `action IN (${[
  'warn',
  'mute',
  'temp_ban',
  'perm_ban',
  'unban',
  'wallet_adjust',
  'auto_mute',
  'auto_suspend',
  'item_grant',
  'item_revoke',
  'content_removal',
  'post_mute',
  'feature_limit',
  'unmute',
  'lift_chat_mute',
  'revoke_sanction',
  'approve_ban',
  'reject_ban',
  'case_decision',
  'case_reopen',
  'case_escalate',
  'csam',
  'caring_message',
  'appeal_decision',
  'session_revoke',
]
  .map((a) => `'${a}'`)
  .join(', ')})`;

/** [table, column] pairs whose rows must survive the account they point at. */
const KEEP = [
  ['chat_reports', 'reporter_id'],
  ['library_reports', 'reporter_id'],
  ['image_reports', 'reporter_id'],
  ['user_reports', 'reporter_id'],
  ['user_reports', 'reported_user_id'],
];

export const up = (pgm) => {
  // ---- admin_actions: survives, and records decisions -----------------------
  pgm.dropConstraint('admin_actions', 'admin_actions_target_user_id_fkey');
  pgm.alterColumn('admin_actions', 'target_user_id', { notNull: false });
  pgm.addConstraint('admin_actions', 'admin_actions_target_user_id_fkey', {
    foreignKeys: { columns: 'target_user_id', references: 'users(id)', onDelete: 'SET NULL' },
  });
  pgm.addColumns('admin_actions', {
    target_user_hash: { type: 'text' },
    case_id: { type: 'uuid', references: 'moderation_cases', onDelete: 'SET NULL' },
    sanction_id: { type: 'uuid', references: 'sanctions', onDelete: 'SET NULL' },
    policy: { type: 'text' },
    statement: { type: 'text' },
    before: { type: 'jsonb' },
    after: { type: 'jsonb' },
  });
  pgm.createIndex('admin_actions', ['case_id', 'created_at'], { where: 'case_id IS NOT NULL' });
  pgm.dropConstraint('admin_actions', 'admin_actions_action_check');
  pgm.addConstraint('admin_actions', 'admin_actions_action_check', { check: ACTIONS_NEW });

  // ---- old report tables and text flags: SET NULL instead of CASCADE ---------
  for (const [table, column] of KEEP) {
    pgm.dropConstraint(table, `${table}_${column}_fkey`);
    pgm.alterColumn(table, column, { notNull: false });
    pgm.addConstraint(table, `${table}_${column}_fkey`, {
      foreignKeys: { columns: column, references: 'users(id)', onDelete: 'SET NULL' },
    });
  }
  pgm.dropConstraint('moderation_flags', 'moderation_flags_author_id_fkey');
  pgm.addConstraint('moderation_flags', 'moderation_flags_author_id_fkey', {
    foreignKeys: { columns: 'author_id', references: 'users(id)', onDelete: 'SET NULL' },
  });

  // ---- chat messages Hevalo removed ---------------------------------------------
  for (const table of ['dm_messages', 'group_messages']) {
    pgm.addColumns(table, {
      moderated_at: { type: 'timestamptz' },
      // the admin; no foreign key, like every other moderator column
      moderated_by: { type: 'uuid' },
    });
  }

  // ---- media kept as evidence ---------------------------------------------------
  pgm.addColumns('media_uploads', {
    preserve_evidence: { type: 'boolean', notNull: true, default: false },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('media_uploads', ['preserve_evidence']);
  for (const table of ['dm_messages', 'group_messages']) {
    pgm.dropColumns(table, ['moderated_at', 'moderated_by']);
  }

  pgm.dropConstraint('moderation_flags', 'moderation_flags_author_id_fkey');
  pgm.addConstraint('moderation_flags', 'moderation_flags_author_id_fkey', {
    foreignKeys: { columns: 'author_id', references: 'users(id)', onDelete: 'CASCADE' },
  });
  for (const [table, column] of KEEP) {
    pgm.sql(`DELETE FROM ${table} WHERE ${column} IS NULL`);
    pgm.dropConstraint(table, `${table}_${column}_fkey`);
    pgm.alterColumn(table, column, { notNull: true });
    pgm.addConstraint(table, `${table}_${column}_fkey`, {
      foreignKeys: { columns: column, references: 'users(id)', onDelete: 'CASCADE' },
    });
  }

  pgm.dropConstraint('admin_actions', 'admin_actions_action_check');
  pgm.sql(`DELETE FROM admin_actions WHERE NOT (${ACTIONS_OLD})`);
  pgm.addConstraint('admin_actions', 'admin_actions_action_check', { check: ACTIONS_OLD });
  pgm.dropIndex('admin_actions', ['case_id', 'created_at']);
  pgm.dropColumns('admin_actions', ['target_user_hash', 'case_id', 'sanction_id', 'policy', 'statement', 'before', 'after']);
  pgm.sql(`DELETE FROM admin_actions WHERE target_user_id IS NULL`);
  pgm.dropConstraint('admin_actions', 'admin_actions_target_user_id_fkey');
  pgm.alterColumn('admin_actions', 'target_user_id', { notNull: true });
  pgm.addConstraint('admin_actions', 'admin_actions_target_user_id_fkey', {
    foreignKeys: { columns: 'target_user_id', references: 'users(id)', onDelete: 'CASCADE' },
  });
};
