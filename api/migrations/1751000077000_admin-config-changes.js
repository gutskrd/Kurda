/**
 * Admin config change approval (KUR-103). Shop-item and event-definition edits
 * go through this queue: low-impact changes apply immediately, but **sensitive**
 * ones (large prices / currency-granting events) require a *second* admin's
 * approval before they apply — no live-ops change needs a deploy, and no single
 * admin can push a costly change alone. Applied changes bust the relevant cache.
 */

export const up = (pgm) => {
  pgm.createTable('admin_config_changes', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    target: { type: 'text', notNull: true, check: "target IN ('shop_item','event')" },
    payload: { type: 'jsonb', notNull: true },
    sensitive: { type: 'boolean', notNull: true, default: false },
    status: {
      type: 'text',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending','applied','rejected')",
    },
    proposer_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    reviewer_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    reason: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    decided_at: { type: 'timestamptz' },
  });
  pgm.createIndex('admin_config_changes', ['status', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('admin_config_changes');
};
