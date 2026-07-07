/**
 * Remove the avatar/cosmetic system (superseded by profile pictures,
 * issues #177–#181). Drops users.avatar_config and the cosmetics
 * inventory. The achievements table is intentionally KEPT — achievements
 * are retained as a standalone feature, just decoupled from cosmetics.
 */

export const up = (pgm) => {
  pgm.dropTable('user_cosmetics', { ifExists: true });
  pgm.dropColumns('users', ['avatar_config'], { ifExists: true });
};

export const down = (pgm) => {
  pgm.addColumns('users', { avatar_config: { type: 'jsonb' } });
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
