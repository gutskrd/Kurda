/**
 * Admin TOTP secrets (KUR-099). One row per admin holding their base32 TOTP
 * secret; `confirmed_at` is set only after the admin proves possession by
 * entering a valid code. An admin without a confirmed secret is denied admin
 * access — 2FA is mandatory, enforced server-side.
 */

export const up = (pgm) => {
  pgm.createTable('admin_totp', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    secret: { type: 'text', notNull: true },
    confirmed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

export const down = (pgm) => {
  pgm.dropTable('admin_totp');
};
