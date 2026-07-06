/**
 * Achievements (KUR-078). Definitions live in code (api/src/avatar/
 * achievements.ts); this table records which user earned which, exactly
 * once (PK), and whether the unlock toast was shown.
 */

export const up = (pgm) => {
  pgm.createTable('user_achievements', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    achievement_id: { type: 'text', notNull: true },
    earned_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    seen_at: { type: 'timestamptz' },
  });
  pgm.addConstraint('user_achievements', 'user_achievements_pkey', {
    primaryKey: ['user_id', 'achievement_id'],
  });
};

export const down = (pgm) => {
  pgm.dropTable('user_achievements');
};
