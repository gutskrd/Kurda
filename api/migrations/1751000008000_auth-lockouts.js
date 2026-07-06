/**
 * Progressive login lockouts (KUR-023). One row per (scope, key):
 * scope 'account' keyed by user id, scope 'ip' keyed by client IP.
 * Rows double as the admin panel's lockout event view (KUR-101).
 */

export const up = (pgm) => {
  pgm.createTable('auth_lockouts', {
    scope: { type: 'text', notNull: true, check: "scope IN ('account', 'ip')" },
    key: { type: 'text', notNull: true },
    failure_count: { type: 'integer', notNull: true, default: 0 },
    lockout_level: { type: 'integer', notNull: true, default: 0 },
    locked_until: { type: 'timestamptz' },
    last_failure_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('auth_lockouts', 'auth_lockouts_pkey', { primaryKey: ['scope', 'key'] });
  pgm.createIndex('auth_lockouts', 'locked_until', { where: 'locked_until IS NOT NULL' });
};

export const down = (pgm) => {
  pgm.dropTable('auth_lockouts');
};
