/**
 * Cosmetic inventory (KUR-077). One row per (user, item); grants are
 * idempotent, revokes are soft (revoked_at) so re-grants restore the
 * original acquisition record. source records where the item came from
 * ('shop', 'achievement', 'event', 'admin'); monetary purchases also
 * hit the wallet ledger (KUR-066/#66) once it exists.
 */

export const up = (pgm) => {
  pgm.createTable('user_cosmetics', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    item_id: { type: 'text', notNull: true },
    source: { type: 'text', notNull: true },
    acquired_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    revoked_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('user_cosmetics', 'user_cosmetics_pkey', {
    primaryKey: ['user_id', 'item_id'],
  });
};

export const down = (pgm) => {
  pgm.dropTable('user_cosmetics');
};
