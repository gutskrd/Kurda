/**
 * Optional phone (SMS) verification (KUR-297). A verified phone raises trust
 * (#295) and lowers risk (#296) but is never required. Privacy-minimized: we
 * store only a **hash** of the E.164 number (uniqueness / accounts-per-number
 * cap / recycle detection) and a **masked** display string — never the raw
 * number. `phone_verifications` holds the in-flight OTP session (one per user).
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    phone_verified_at: { type: 'timestamptz' },
    phone_hash: { type: 'text' }, // sha256 of E.164 — uniqueness / abuse checks
    phone_masked: { type: 'text' }, // e.g. +1 ••• ••• 1234 — safe to display
  });
  // find accounts sharing a number (cap + recycle detach); one verified holder
  pgm.createIndex('users', 'phone_hash', { where: 'phone_hash IS NOT NULL' });

  pgm.createTable('phone_verifications', {
    user_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    phone_hash: { type: 'text', notNull: true },
    phone_masked: { type: 'text', notNull: true },
    code_hash: { type: 'text', notNull: true },
    attempts: { type: 'integer', notNull: true, default: 0 },
    sends: { type: 'integer', notNull: true, default: 1 },
    last_sent_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
};

export const down = (pgm) => {
  pgm.dropTable('phone_verifications');
  pgm.dropColumns('users', ['phone_verified_at', 'phone_hash', 'phone_masked']);
};
