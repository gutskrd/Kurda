/**
 * Payment fraud detection (KUR-073). fraud_reviews is the admin queue: one row
 * per auto-flagged purchase with the triggering flags + evidence. account_holds
 * marks accounts whose purchases are held (not banned) pending review. A held
 * IAP purchase keeps its receipt at status 'held' (no Gems granted) until an
 * admin clears it, so this migration widens the iap_receipts status check.
 */

export const up = (pgm) => {
  // allow receipts to sit in a held state before grant
  pgm.dropConstraint('iap_receipts', 'iap_receipts_status_check');
  pgm.addConstraint('iap_receipts', 'iap_receipts_status_check', {
    check: "status IN ('granted','refunded','held')",
  });

  pgm.createTable('account_holds', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    reason: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('fraud_reviews', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    /** the held receipt this review gates, if any */
    receipt_id: { type: 'uuid', references: 'iap_receipts', onDelete: 'SET NULL' },
    flags: { type: 'jsonb', notNull: true },
    evidence: { type: 'jsonb', notNull: true },
    status: { type: 'text', notNull: true, default: 'open' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    resolved_at: { type: 'timestamptz' },
    resolved_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
  });
  pgm.addConstraint('fraud_reviews', 'fraud_reviews_status_check', {
    check: "status IN ('open','cleared','confirmed')",
  });
  pgm.createIndex('fraud_reviews', ['status', 'created_at']);
  pgm.createIndex('fraud_reviews', 'user_id');
};

export const down = (pgm) => {
  pgm.dropTable('fraud_reviews');
  pgm.dropTable('account_holds');
  pgm.dropConstraint('iap_receipts', 'iap_receipts_status_check');
  pgm.addConstraint('iap_receipts', 'iap_receipts_status_check', {
    check: "status IN ('granted','refunded')",
  });
};
