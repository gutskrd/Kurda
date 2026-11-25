/**
 * Families and child profiles (shared/src/family.ts, api/src/family).
 *
 * - `users.kind`: 'child' for a profile a parent made for a child under 13, which has no email, password or picture
 *   of its own; everyone else is a 'person'.
 * - `families` and `family_members`: one adult owner and up to five more; a person is in one family at most, so the
 *   member's id is the key. `plus_until` is the family plan, which makes every member a Hevalo+ member while it lasts.
 * - `family_invites`: the one code an owner has out for adults at a time, kept as a keyed hash, used once.
 * - `child_profiles`: what belongs to a child's profile beyond the user row: the parent who made it and consented,
 *   the consent's wording and time, the parent's two switches, and the times the profile's upkeep needs.
 * - `child_consent_log`: that a parent consented to, or deleted, a profile, kept without the child, for the years the
 *   law asks such a record to be kept.
 * - `child_pairing_codes`: the six digits a parent shows to sign a child's own phone in, used once, for minutes.
 * - `family_pins`: the PIN that takes the parent's phone back from a child, hashed, with its run of wrong tries.
 * - `child_purchase_requests`: what a child asked a parent to buy, and the parent's answer.
 * - `refresh_tokens.return_to`: on a child's session opened on the parent's own phone, the parent the PIN returns it to.
 */

export const up = (pgm) => {
  pgm.addColumn('users', {
    kind: { type: 'text', notNull: true, default: 'person', check: "kind IN ('person','child')" },
  });
  // A child profile has no address, as a guest has none.
  pgm.dropConstraint('users', 'users_email_unless_guest');
  pgm.addConstraint('users', 'users_email_unless_guest', { check: "email IS NOT NULL OR guest OR kind = 'child'" });

  pgm.createTable('families', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    owner_id: { type: 'uuid', notNull: true, unique: true, references: 'users', onDelete: 'CASCADE' },
    plus_until: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('family_members', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    family_id: { type: 'uuid', notNull: true, references: 'families', onDelete: 'CASCADE' },
    role: { type: 'text', notNull: true, check: "role IN ('owner','adult','teen','child')" },
    joined_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('family_members', 'family_id');

  pgm.createTable('family_invites', {
    family_id: { type: 'uuid', primaryKey: true, references: 'families', onDelete: 'CASCADE' },
    code_hash: { type: 'text', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('child_profiles', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    parent_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    consent_version: { type: 'text', notNull: true },
    consented_at: { type: 'timestamptz', notNull: true },
    reminders_allowed: { type: 'boolean', notNull: true, default: false },
    purchases_allowed: { type: 'boolean', notNull: true, default: false },
    // the parent's "keep it" after the warning that an unused profile goes
    kept_at: { type: 'timestamptz' },
    idle_warned_at: { type: 'timestamptz' },
    thirteen_noticed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('child_profiles', 'parent_id');

  // No reference to the parent: the record outlives the parent's account, and names no child.
  pgm.createTable('child_consent_log', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    parent_id: { type: 'uuid', notNull: true },
    action: { type: 'text', notNull: true, check: "action IN ('created','deleted')" },
    consent_version: { type: 'text', notNull: true },
    at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('child_consent_log', 'at');

  pgm.createTable('child_pairing_codes', {
    child_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    code_hash: { type: 'text', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('family_pins', {
    parent_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    pin_hash: { type: 'text', notNull: true },
    failed_tries: { type: 'integer', notNull: true, default: 0 },
    locked_until: { type: 'timestamptz' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('child_purchase_requests', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    child_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    parent_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    kind: { type: 'text', notNull: true, check: "kind IN ('plus','zer','look')" },
    product: { type: 'text', notNull: true, check: 'length(product) BETWEEN 1 AND 100' },
    status: { type: 'text', notNull: true, default: 'pending', check: "status IN ('pending','approved','declined')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    decided_at: { type: 'timestamptz' },
  });
  // Asking again for the same thing while the first ask waits is the same ask.
  pgm.createIndex('child_purchase_requests', ['child_id', 'kind', 'product'], { unique: true, where: "status = 'pending'", name: 'child_purchase_requests_one_pending' });
  pgm.createIndex('child_purchase_requests', ['parent_id', 'status']);

  pgm.addColumn('refresh_tokens', {
    return_to: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
  });
};

export const down = (pgm) => {
  pgm.dropColumn('refresh_tokens', 'return_to');
  pgm.dropTable('child_purchase_requests');
  pgm.dropTable('family_pins');
  pgm.dropTable('child_pairing_codes');
  pgm.dropTable('child_consent_log');
  pgm.dropTable('child_profiles');
  pgm.dropTable('family_invites');
  pgm.dropTable('family_members');
  pgm.dropTable('families');
  // Child profiles cannot exist without the column that says what they are.
  pgm.sql("DELETE FROM users WHERE kind = 'child'");
  pgm.dropConstraint('users', 'users_email_unless_guest');
  pgm.addConstraint('users', 'users_email_unless_guest', { check: 'email IS NOT NULL OR guest' });
  pgm.dropColumn('users', 'kind');
};
