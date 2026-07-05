/**
 * Core users table (KUR-004, #4).
 *
 * Conventions established here (documented in api/DATABASE.md):
 * - uuid PKs via gen_random_uuid()
 * - citext for case-insensitive email/username uniqueness
 * - soft delete via deleted_at; uniqueness enforced only among active
 *   rows (partial unique indexes) so deleted accounts free their names
 * - updated_at maintained by trigger
 * - username charset includes Kurdish Latin letters (ê î û ç ş)
 */

export const up = (pgm) => {
  pgm.createFunction(
    'set_updated_at',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    'BEGIN NEW.updated_at = now(); RETURN NEW; END;',
  );

  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'citext', notNull: true },
    username: { type: 'citext', notNull: true },
    display_name: { type: 'text' },
    // nullable: OAuth-only accounts (KUR-019) have no password
    password_hash: { type: 'text' },
    locale: { type: 'text', notNull: true, default: 'en' },
    timezone: { type: 'text', notNull: true, default: 'UTC' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    deleted_at: { type: 'timestamptz' },
  });

  pgm.addConstraint('users', 'users_username_format', {
    check: "username ~ '^[A-Za-z0-9_êîûçşÊÎÛÇŞ]{3,30}$'",
  });

  pgm.createIndex('users', 'email', {
    name: 'users_email_active_uniq',
    unique: true,
    where: 'deleted_at IS NULL',
  });
  pgm.createIndex('users', 'username', {
    name: 'users_username_active_uniq',
    unique: true,
    where: 'deleted_at IS NULL',
  });

  pgm.createTrigger('users', 'users_set_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    level: 'ROW',
    function: 'set_updated_at',
  });
};

export const down = (pgm) => {
  pgm.dropTable('users');
  pgm.dropFunction('set_updated_at', []);
};
