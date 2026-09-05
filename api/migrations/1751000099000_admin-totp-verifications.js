/**
 * Per-session record that an admin passed their 2FA check.
 *
 * `admin_totp.confirmed_at` only says an admin ENROLLED once. Enforcing that
 * alone means a stolen access token reaches the whole admin panel without anyone
 * ever entering a code. This records that a specific login session cleared 2FA,
 * so the check has to be repeated on a new device and again once it expires.
 *
 * `family_id` is the refresh-token family from the access token's `fam` claim —
 * one per login, carried across refresh rotation. That makes verification
 * per-login rather than per-account: verifying on your laptop does not silently
 * admit a session someone else opened with your password.
 */

export const up = (pgm) => {
  pgm.createTable('admin_totp_verifications', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    family_id: { type: 'uuid', notNull: true },
    verified_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('admin_totp_verifications', 'admin_totp_verifications_pkey', {
    primaryKey: ['user_id', 'family_id'],
  });
  // supports the sweep of expired rows
  pgm.createIndex('admin_totp_verifications', 'verified_at');
};

export const down = (pgm) => {
  pgm.dropTable('admin_totp_verifications');
};
