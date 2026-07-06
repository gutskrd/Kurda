/**
 * OAuth identities (KUR-019): one row per (provider, provider account).
 * A user can have multiple providers linked; a provider account maps to
 * exactly one Kurda user.
 */

export const up = (pgm) => {
  pgm.createTable('oauth_identities', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    provider: { type: 'text', notNull: true, check: "provider IN ('google', 'apple')" },
    provider_user_id: { type: 'text', notNull: true },
    email_at_link: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('oauth_identities', 'oauth_identities_provider_account_uniq', {
    unique: ['provider', 'provider_user_id'],
  });
  pgm.createIndex('oauth_identities', ['user_id']);
};

export const down = (pgm) => {
  pgm.dropTable('oauth_identities');
};
