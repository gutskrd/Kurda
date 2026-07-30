/**
 * Signup & login risk decisions (KUR-296). One row per assessed auth attempt:
 * the score, band, action, and the contributing signals — logged for tuning and
 * audit (#104). IP and device identifiers are stored **hashed only** (never raw,
 * never in URLs) and the table is retention-bounded (#109): a scheduled prune
 * drops rows past the window using the created_at index. `user_id` carries no FK
 * so a decision outlives the account it assessed (audit trail).
 */

export const up = (pgm) => {
  pgm.createTable('risk_decisions', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    event: { type: 'text', notNull: true, check: "event IN ('signup','login')" },
    // no FK: survives user deletion so the audit trail is intact
    user_id: { type: 'uuid' },
    ip_hash: { type: 'text' },
    device_hash: { type: 'text' },
    score: { type: 'integer', notNull: true },
    band: { type: 'text', notNull: true, check: "band IN ('low','medium','high')" },
    action: {
      type: 'text',
      notNull: true,
      check: "action IN ('proceed','step_up','verify_or_block')",
    },
    hard_block: { type: 'boolean', notNull: true, default: false },
    signals: { type: 'jsonb', notNull: true, default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // account-velocity lookups by device / IP within the recent window
  pgm.createIndex('risk_decisions', ['device_hash', 'created_at']);
  pgm.createIndex('risk_decisions', ['ip_hash', 'created_at']);
  // retention prune scans by age
  pgm.createIndex('risk_decisions', 'created_at');
};

export const down = (pgm) => {
  pgm.dropTable('risk_decisions');
};
