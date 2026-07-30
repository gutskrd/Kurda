/**
 * In-app purchases (KUR-072). gem_packs maps a store product to a Gem grant.
 * iap_receipts stores every validated receipt — `(platform, transaction_id)`
 * is unique so a receipt can only ever grant once (duplicate rejection +
 * restore-purchases reconciliation), and refunds flip status and record how
 * many Gems were actually clawed back.
 */

export const up = (pgm) => {
  pgm.createTable('gem_packs', {
    platform: { type: 'text', notNull: true },
    product_id: { type: 'text', notNull: true },
    gems: { type: 'integer', notNull: true },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('gem_packs', 'gem_packs_pkey', { primaryKey: ['platform', 'product_id'] });
  pgm.addConstraint('gem_packs', 'gem_packs_platform_check', {
    check: "platform IN ('apple','google')",
  });
  pgm.addConstraint('gem_packs', 'gem_packs_gems_check', { check: 'gems > 0' });

  pgm.createTable('iap_receipts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    platform: { type: 'text', notNull: true },
    transaction_id: { type: 'text', notNull: true },
    product_id: { type: 'text', notNull: true },
    environment: { type: 'text', notNull: true, default: 'production' },
    gems: { type: 'integer', notNull: true },
    status: { type: 'text', notNull: true, default: 'granted' },
    clawed_back: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    refunded_at: { type: 'timestamptz' },
  });
  // a store transaction grants exactly once, across restore + retries
  pgm.addConstraint('iap_receipts', 'iap_receipts_txn_unique', {
    unique: ['platform', 'transaction_id'],
  });
  pgm.addConstraint('iap_receipts', 'iap_receipts_status_check', {
    check: "status IN ('granted','refunded')",
  });
  pgm.addConstraint('iap_receipts', 'iap_receipts_env_check', {
    check: "environment IN ('sandbox','production')",
  });
  pgm.createIndex('iap_receipts', ['user_id', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('iap_receipts');
  pgm.dropTable('gem_packs');
};
