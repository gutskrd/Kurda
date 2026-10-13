/**
 * Sanctions with a statement of reasons, appeals, and a registry of banned
 * addresses.
 *
 * A moderation action used to be two columns on `users` (`banned_at`,
 * `muted_until`) plus an `admin_actions` row whose reason the person never saw.
 * Nobody was told they had been warned, nothing said which rule or until when,
 * and there was no way to ask for a second look — all things the DSA (Art. 17
 * statement of reasons, Art. 20 complaints) and the UK Online Safety Act
 * (appeals for every service) expect, and that Discord, Instagram and Twitch
 * show their users.
 *
 * `sanctions` is now the record: what (kind), which rule (policy), what we told
 * the person (statement), what we noted privately, from when until when (null
 * = no end), the case it came from, who decided and who confirmed it, and
 * whether it was revoked. The columns on `users` stay the ones every request
 * checks — the auth hook reads `banned_at`/`banned_until`, the chat routes
 * `muted_until` — and the sanctions service keeps them in step in the same
 * transaction, so enforcement stays one indexed read.
 *
 * A permanent ban needs a second admin when there are two (72 hours, with an
 * emergency suspension in the meantime): `pending_approval` holds such a ban
 * until then. A zero-tolerance ban (child safety) is in force at once and the
 * confirmation comes after the fact; with a single admin it applies directly and
 * `single_approved` records that nobody else looked.
 *
 * Nothing here cascades on account deletion: a sanction or an appeal outlives
 * the account (the id is nulled if a row is ever hard-deleted, and `user_hash`,
 * a keyed pseudonym, keeps the history countable).
 *
 * `ban_registry` holds keyed hashes of the normalised email addresses of
 * permanently banned accounts, so the same person cannot sign straight back up
 * (signup checks it and answers with the generic refusal). Hashes only: the
 * address itself is never kept for this. The permanent bans carried over below
 * are put on it by the app, not here — the hash needs the server's key — on its
 * first retention sweep (SanctionsService.backfillBanRegistry).
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
const KINDS = ['warning', 'content_removal', 'chat_mute', 'post_mute', 'feature_limit', 'suspension', 'permanent_ban'];
const list = (values) => values.map((v) => `'${v}'`).join(',');

/** What a person carried over from before this table is told. */
const LEGACY_STATEMENT =
  'Your account was restricted by Hevalo before account standing existed, so no reason was recorded for you. ' +
  'If you think this was a mistake, ask for a review.';

export const up = (pgm) => {
  pgm.createTable('sanctions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    // set for every sanction the service writes; rows carried over below have none
    user_hash: { type: 'text' },
    kind: { type: 'text', notNull: true, check: `kind IN (${list(KINDS)})` },
    policy: { type: 'text', notNull: true, check: `policy IN (${list(CATEGORIES)})` },
    statement: { type: 'text', notNull: true, check: 'char_length(statement) BETWEEN 1 AND 2000' },
    internal_note: { type: 'text' },
    starts_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    ends_at: { type: 'timestamptz' },
    case_id: { type: 'uuid', references: 'moderation_cases', onDelete: 'SET NULL' },
    // report = a case built from user reports; automatic = no person decided it
    origin: { type: 'text', notNull: true, default: 'moderator', check: "origin IN ('report','automatic','moderator')" },
    // admins, kept without a foreign key so the record outlives their account
    created_by: { type: 'uuid' },
    approved_by: { type: 'uuid' },
    approved_at: { type: 'timestamptz' },
    pending_approval: { type: 'boolean', notNull: true, default: false },
    single_approved: { type: 'boolean', notNull: true, default: false },
    zero_tolerance: { type: 'boolean', notNull: true, default: false },
    revoked_at: { type: 'timestamptz' },
    revoked_by: { type: 'uuid' },
    revoke_reason: { type: 'text' },
    acknowledged_at: { type: 'timestamptz' },
    meta: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('sanctions', 'sanctions_period_check', { check: 'ends_at IS NULL OR ends_at > starts_at' });
  pgm.createIndex('sanctions', ['user_id', 'created_at']);
  // enforcement and standing read a person's unrevoked sanctions
  pgm.createIndex('sanctions', ['user_id', 'kind'], { name: 'sanctions_live_idx', where: 'revoked_at IS NULL' });
  pgm.createIndex('sanctions', 'case_id');
  // the approvals list: permanent bans nobody has confirmed yet
  pgm.createIndex('sanctions', ['created_at'], {
    name: 'sanctions_unconfirmed_idx',
    where: "kind = 'permanent_ban' AND approved_at IS NULL AND revoked_at IS NULL",
  });

  pgm.createTable('appeals', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    // a sanction you received, or a case whose "no violation" you reported
    sanction_id: { type: 'uuid', references: 'sanctions', onDelete: 'SET NULL' },
    case_id: { type: 'uuid', references: 'moderation_cases', onDelete: 'SET NULL' },
    user_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    user_hash: { type: 'text' },
    text: { type: 'text', notNull: true, check: 'char_length(text) BETWEEN 1 AND 2000' },
    status: {
      type: 'text',
      notNull: true,
      default: 'open',
      check: "status IN ('open','upheld','overturned','modified')",
    },
    decided_by: { type: 'uuid' },
    decided_at: { type: 'timestamptz' },
    decision_note: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('appeals', 'appeals_subject_check', { check: 'sanction_id IS NOT NULL OR case_id IS NOT NULL' });
  // one appeal per decision
  pgm.createIndex('appeals', 'sanction_id', { name: 'appeals_one_per_sanction', unique: true, where: 'sanction_id IS NOT NULL' });
  pgm.createIndex('appeals', ['case_id', 'user_id'], {
    name: 'appeals_one_per_case_decision',
    unique: true,
    where: 'sanction_id IS NULL AND case_id IS NOT NULL',
  });
  pgm.createIndex('appeals', ['status', 'created_at']);
  pgm.createIndex('appeals', 'user_id');

  pgm.createTable('ban_registry', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    // 'email' today; device flags can join it later without a new table
    kind: { type: 'text', notNull: true, default: 'email', check: "kind IN ('email','device')" },
    value_hash: { type: 'text', notNull: true },
    sanction_id: { type: 'uuid', references: 'sanctions', onDelete: 'SET NULL' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('ban_registry', 'ban_registry_value_uniq', { unique: ['kind', 'value_hash'] });

  /*
   * Carry over what is in force today, so standing pages and "unban" see it.
   * A ban becomes a suspension (with an end) or a permanent ban (without);
   * `users.muted_until` was always described as a chat-mute deadline, so it
   * becomes a chat mute. The most recent matching admin_actions row says whether
   * a person or the spam engine did it; its reason was written for staff, so it
   * goes to the internal note, never to the person.
   */
  pgm.sql(
    `INSERT INTO sanctions (user_id, kind, policy, statement, internal_note, starts_at, ends_at, origin,
                            created_by, approved_by, approved_at, meta)
     SELECT u.id,
            CASE WHEN u.banned_until IS NULL THEN 'permanent_ban' ELSE 'suspension' END,
            CASE WHEN a.action = 'auto_suspend' THEN 'spam' ELSE 'other' END,
            $statement$${LEGACY_STATEMENT}$statement$,
            a.reason,
            u.banned_at,
            CASE WHEN u.banned_until > u.banned_at THEN u.banned_until END,
            CASE WHEN a.action = 'auto_suspend' THEN 'automatic' ELSE 'moderator' END,
            a.admin_id, a.admin_id, u.banned_at,
            '{"legacy": true}'::jsonb
       FROM users u
       LEFT JOIN LATERAL (
         SELECT action, reason, admin_id FROM admin_actions
          WHERE target_user_id = u.id AND action IN ('temp_ban','perm_ban','auto_suspend')
          ORDER BY created_at DESC LIMIT 1
       ) a ON true
      WHERE u.banned_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until > now())`,
  );
  pgm.sql(
    `INSERT INTO sanctions (user_id, kind, policy, statement, internal_note, starts_at, ends_at, origin, created_by, meta)
     SELECT u.id, 'chat_mute',
            CASE WHEN a.action = 'auto_mute' THEN 'spam' ELSE 'other' END,
            $statement$${LEGACY_STATEMENT}$statement$,
            a.reason,
            LEAST(now(), u.muted_until - interval '1 second'),
            u.muted_until,
            CASE WHEN a.action = 'auto_mute' THEN 'automatic' ELSE 'moderator' END,
            a.admin_id,
            '{"legacy": true}'::jsonb
       FROM users u
       LEFT JOIN LATERAL (
         SELECT action, reason, admin_id FROM admin_actions
          WHERE target_user_id = u.id AND action IN ('mute','auto_mute')
          ORDER BY created_at DESC LIMIT 1
       ) a ON true
      WHERE u.muted_until > now()`,
  );
};

export const down = (pgm) => {
  pgm.dropTable('ban_registry');
  pgm.dropTable('appeals');
  pgm.dropTable('sanctions');
};
