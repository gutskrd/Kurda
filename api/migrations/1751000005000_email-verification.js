/**
 * Email verification (KUR-017) + shared single-use email token table
 * (reused by password reset, KUR-018). Tokens stored sha256-hashed.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    email_verified_at: { type: 'timestamptz' },
  });
  pgm.createTable('email_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    token_hash: { type: 'text', notNull: true, unique: true },
    purpose: { type: 'text', notNull: true, check: "purpose IN ('verify_email', 'password_reset')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    used_at: { type: 'timestamptz' },
  });
  pgm.createIndex('email_tokens', ['user_id', 'purpose']);
};

export const down = (pgm) => {
  pgm.dropTable('email_tokens');
  pgm.dropColumns('users', ['email_verified_at']);
};
