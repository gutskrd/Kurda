/**
 * Bans that hold, without hurting people who share a network.
 *
 * - `ban_takedowns` and `ban_takedown_items`: what a suspension or ban did to the person's content (hidden, or removed
 *   for good once the appeal window has passed), one reversible row per item, so lifting or overturning the ban puts
 *   back exactly what it took.
 * - `ban_registry` holds every signal of a banned person, not only the address: OAuth subjects, phone, install ids and
 *   push tokens, each a keyed hash with the key's version, per ban, with when it ends for a suspension.
 * - `device_sightings`: which install ids an account used on which days, kept 180 days, so a returning device is
 *   recognised however the person signed in.
 * - `possible_returns`: accounts that may belong to a banned person, with the signals that matched, for a person to
 *   decide; `users.held_at` is the hold on a strong match (learning goes on, posting and messaging wait), and a
 *   sanction stands for it so the person can read and appeal it.
 * - `trusted_networks`: networks a superadmin vouched for (a school), which lifts the sign-up network cap until they end.
 * - `sanctions.notice_email_state`: the emailed statement of reasons, sent once by an outbox sweep.
 */

const KINDS_OLD = ['email', 'device'];
const KINDS_NEW = ['email', 'device', 'oauth', 'phone', 'push'];
const list = (values) => values.map((v) => `'${v}'`).join(',');

/** The decision log's actions before, and the ones added: holds and their decisions, linked bans, trusted networks. */
const ACTIONS_BEFORE = [
  'warn', 'mute', 'temp_ban', 'perm_ban', 'unban', 'wallet_adjust', 'auto_mute', 'auto_suspend', 'item_grant', 'item_revoke',
  'content_removal', 'post_mute', 'feature_limit', 'unmute', 'lift_chat_mute', 'revoke_sanction', 'approve_ban', 'reject_ban',
  'case_decision', 'case_reopen', 'case_escalate', 'csam', 'caring_message', 'appeal_decision', 'session_revoke', 'role_grant',
  'role_revoke', 'plus_grant',
];
const ACTIONS_AFTER = [
  ...ACTIONS_BEFORE,
  'possible_return_hold', 'possible_return_cleared', 'possible_return_same', 'linked_ban', 'trusted_network_add', 'trusted_network_remove',
];
const actionCheck = (actions) => `action IN (${list(actions)})`;

export const up = (pgm) => {
  // ---- what a ban did to the person's content ---------------------------------------
  pgm.createTable('ban_takedowns', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    sanction_id: { type: 'uuid', notNull: true, unique: true, references: 'sanctions', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    choice: { type: 'text', notNull: true, check: "choice IN ('hide','remove')" },
    include_messages: { type: 'boolean', notNull: true, default: false },
    state: { type: 'text', notNull: true, default: 'hidden', check: "state IN ('hidden','restored','purged')" },
    counts: { type: 'jsonb', notNull: true, default: '{}' },
    // a removal is deleted for good after the appeal window, unless it was overturned first
    purge_after: { type: 'timestamptz' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    restored_at: { type: 'timestamptz' },
    restore_reason: { type: 'text' },
    purged_at: { type: 'timestamptz' },
  });
  pgm.createIndex('ban_takedowns', 'user_id');
  pgm.createIndex('ban_takedowns', 'purge_after', { name: 'ban_takedowns_live_idx', where: "state = 'hidden'" });

  pgm.createTable(
    'ban_takedown_items',
    {
      takedown_id: { type: 'uuid', notNull: true, references: 'ban_takedowns', onDelete: 'CASCADE' },
      item_type: {
        type: 'text',
        notNull: true,
        check: `item_type IN ('library_post','image_post','library_comment','image_comment','group_message','dm_message','letter','profile','group_photo','picture')`,
      },
      item_id: { type: 'text', notNull: true },
      previous: { type: 'jsonb', notNull: true, default: '{}' },
    },
    { constraints: { primaryKey: ['takedown_id', 'item_type', 'item_id'] } },
  );
  // whether a picture is still kept for a ban's appeal (the refused-picture sweep asks)
  pgm.createIndex('ban_takedown_items', ['item_type', 'item_id'], { name: 'ban_takedown_items_item_idx' });

  // a takedown reads a person's comments and group messages by author
  pgm.createIndex('library_comments', 'author_id', { name: 'library_comments_author_idx' });
  pgm.createIndex('image_comments', 'author_id', { name: 'image_comments_author_idx' });
  pgm.createIndex('group_messages', 'sender_id', { name: 'group_messages_sender_idx' });

  // ---- the registry: every signal of a banned person ------------------------------------
  pgm.dropConstraint('ban_registry', 'ban_registry_kind_check');
  pgm.addConstraint('ban_registry', 'ban_registry_kind_check', { check: `kind IN (${list(KINDS_NEW)})` });
  pgm.addColumns('ban_registry', {
    // 1: keyed from the JWT secret (as before); 2: IDENTITY_HASH_SECRET
    key_version: { type: 'smallint', notNull: true, default: 1 },
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    user_hash: { type: 'text' },
    // a suspension's signals end with it; a permanent ban's stand until it is lifted
    expires_at: { type: 'timestamptz' },
    // when the signal was last seen for the banned person (an install id's last day)
    seen_at: { type: 'timestamptz' },
  });
  pgm.sql(`UPDATE ban_registry r SET user_id = s.user_id, user_hash = s.user_hash FROM sanctions s WHERE s.id = r.sanction_id`);
  // one row per ban: two banned people on one family tablet each keep theirs
  pgm.dropConstraint('ban_registry', 'ban_registry_value_uniq');
  pgm.addConstraint('ban_registry', 'ban_registry_signal_uniq', { unique: ['kind', 'key_version', 'value_hash', 'sanction_id'] });
  pgm.createIndex('ban_registry', 'sanction_id');
  pgm.createIndex('ban_registry', 'user_id');
  pgm.createIndex('ban_registry', 'expires_at', { where: 'expires_at IS NOT NULL' });

  // ---- install ids by account and day -------------------------------------------------
  pgm.createTable(
    'device_sightings',
    {
      user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
      // sha256 of the app's random install id, as risk_decisions stores it
      device_hash: { type: 'text', notNull: true },
      day: { type: 'date', notNull: true },
      first_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      last_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { constraints: { primaryKey: ['user_id', 'device_hash', 'day'] } },
  );
  pgm.createIndex('device_sightings', ['device_hash', 'day'], { name: 'device_sightings_device_day_idx' });
  pgm.createIndex('device_sightings', 'day', { name: 'device_sightings_day_idx' });
  // what sign-ups and sign-ins already recorded carries over
  pgm.sql(`
    INSERT INTO device_sightings (user_id, device_hash, day, first_at, last_at)
    SELECT user_id, device_hash, (created_at AT TIME ZONE 'UTC')::date, min(created_at), max(created_at)
      FROM risk_decisions
     WHERE user_id IS NOT NULL AND device_hash IS NOT NULL
     GROUP BY 1, 2, 3
    ON CONFLICT DO NOTHING`);

  // ---- possible returns ----------------------------------------------------------------
  pgm.addColumns('users', {
    held_at: { type: 'timestamptz' },
    hold_reason: { type: 'text', check: "hold_reason IN ('possible_return')" },
  });
  pgm.addConstraint('users', 'users_hold_shape', { check: '(held_at IS NULL) = (hold_reason IS NULL)' });
  pgm.createIndex('users', 'held_at', { name: 'users_held_idx', where: 'held_at IS NOT NULL' });

  pgm.createTable('possible_returns', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    // the account that may be a return
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    // the banned account it may belong to; its pseudonym stays if the account is erased
    banned_user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    banned_user_hash: { type: 'text', notNull: true },
    sanction_id: { type: 'uuid', references: 'sanctions', onDelete: 'SET NULL' },
    strength: { type: 'text', notNull: true, check: "strength IN ('strong','medium')" },
    signals: { type: 'jsonb', notNull: true, default: '[]' },
    held: { type: 'boolean', notNull: true, default: false },
    status: { type: 'text', notNull: true, default: 'open', check: "status IN ('open','same_person','not_same_person','closed')" },
    first_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    decided_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    decided_at: { type: 'timestamptz' },
    decision_note: { type: 'text' },
    linked_sanction_id: { type: 'uuid', references: 'sanctions', onDelete: 'SET NULL' },
  });
  pgm.addConstraint('possible_returns', 'possible_returns_pair_uniq', { unique: ['user_id', 'banned_user_hash'] });
  pgm.createIndex('possible_returns', ['status', 'last_seen_at'], { name: 'possible_returns_queue_idx' });
  pgm.createIndex('possible_returns', 'banned_user_id');

  // ---- networks a superadmin vouched for ------------------------------------------------
  pgm.createTable('trusted_networks', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    net_hash: { type: 'text', notNull: true },
    // how the console shows it: the address with its last part hidden
    network_hint: { type: 'text', notNull: true },
    reason: { type: 'text', notNull: true, check: 'char_length(reason) BETWEEN 1 AND 500' },
    created_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    removed_at: { type: 'timestamptz' },
    removed_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
  });
  pgm.addConstraint('trusted_networks', 'trusted_networks_expiry', { check: "expires_at > created_at AND expires_at <= created_at + interval '366 days'" });
  pgm.createIndex('trusted_networks', 'net_hash', { name: 'trusted_networks_live_uniq', unique: true, where: 'removed_at IS NULL' });

  // ---- the emailed statement of reasons ------------------------------------------------
  pgm.addColumns('sanctions', {
    notice_email_state: { type: 'text', check: "notice_email_state IN ('pending','sent','skipped')" },
    notice_emailed_at: { type: 'timestamptz' },
  });
  pgm.createIndex('sanctions', 'created_at', { name: 'sanctions_notice_email_due', where: "notice_email_state = 'pending'" });

  pgm.dropConstraint('admin_actions', 'admin_actions_action_check');
  pgm.addConstraint('admin_actions', 'admin_actions_action_check', { check: actionCheck(ACTIONS_AFTER) });
};

export const down = (pgm) => {
  pgm.dropConstraint('admin_actions', 'admin_actions_action_check');
  // the history is append-only: rows already written stay, and only new ones are held to the old list
  pgm.sql(`ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_check CHECK (${actionCheck(ACTIONS_BEFORE)}) NOT VALID`);

  pgm.dropIndex('sanctions', 'created_at', { name: 'sanctions_notice_email_due' });
  pgm.dropColumns('sanctions', ['notice_email_state', 'notice_emailed_at']);

  pgm.dropTable('trusted_networks');
  pgm.dropTable('possible_returns');
  pgm.dropIndex('users', 'held_at', { name: 'users_held_idx' });
  pgm.dropConstraint('users', 'users_hold_shape');
  pgm.dropColumns('users', ['held_at', 'hold_reason']);

  pgm.dropTable('device_sightings');

  pgm.dropIndex('ban_registry', 'expires_at');
  pgm.dropIndex('ban_registry', 'user_id');
  pgm.dropIndex('ban_registry', 'sanction_id');
  pgm.dropConstraint('ban_registry', 'ban_registry_signal_uniq');
  // the old registry knew addresses of permanent bans only, one row per address
  pgm.sql(`DELETE FROM ban_registry WHERE kind <> 'email' OR key_version <> 1 OR expires_at IS NOT NULL`);
  pgm.sql(`DELETE FROM ban_registry r USING ban_registry o WHERE r.kind = o.kind AND r.value_hash = o.value_hash AND r.created_at > o.created_at`);
  pgm.sql(`DELETE FROM ban_registry r USING ban_registry o WHERE r.kind = o.kind AND r.value_hash = o.value_hash AND r.created_at = o.created_at AND r.id > o.id`);
  pgm.addConstraint('ban_registry', 'ban_registry_value_uniq', { unique: ['kind', 'value_hash'] });
  pgm.dropColumns('ban_registry', ['key_version', 'user_id', 'user_hash', 'expires_at', 'seen_at']);
  pgm.dropConstraint('ban_registry', 'ban_registry_kind_check');
  pgm.addConstraint('ban_registry', 'ban_registry_kind_check', { check: `kind IN (${list(KINDS_OLD)})` });

  pgm.dropIndex('group_messages', 'sender_id', { name: 'group_messages_sender_idx' });
  pgm.dropIndex('image_comments', 'author_id', { name: 'image_comments_author_idx' });
  pgm.dropIndex('library_comments', 'author_id', { name: 'library_comments_author_idx' });

  pgm.dropTable('ban_takedown_items');
  pgm.dropTable('ban_takedowns');
};
