/**
 * A/B experiments (KUR-107). Each row is one experiment: its variants (with
 * weights) and an `enabled` kill-switch. Assignment itself is deterministic and
 * computed at read time from (user, key) — nothing per-user is stored, so a user
 * keeps the same variant across devices and reinstalls. Ships one pilot
 * experiment (daily-goal default) enabled at a 50/50 split.
 */

export const up = (pgm) => {
  pgm.createTable('experiments', {
    key: { type: 'text', primaryKey: true },
    description: { type: 'text' },
    enabled: { type: 'boolean', notNull: true, default: true },
    variants: { type: 'jsonb', notNull: true, default: '[]' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // pilot experiment: does a higher default daily goal help or hurt retention?
  pgm.sql(`
    INSERT INTO experiments (key, description, enabled, variants)
    VALUES (
      'daily_goal_default',
      'Default daily XP goal for new users: 20 (control) vs 30 (variant_b)',
      true,
      '[{"key":"control","weight":50},{"key":"variant_b","weight":50}]'::jsonb
    )
    ON CONFLICT (key) DO NOTHING
  `);
};

export const down = (pgm) => {
  pgm.dropTable('experiments');
};
