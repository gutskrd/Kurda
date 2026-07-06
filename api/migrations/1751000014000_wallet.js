/**
 * Economy wallet (KUR-066): Zêr (soft currency) + Gems (premium-earned).
 *
 * wallet_ledger is APPEND-ONLY — a DB trigger rejects UPDATE/DELETE, so
 * every balance is derivable from history and history can't be rewritten.
 * wallet_balances is the transactionally-maintained materialization
 * (kept in the same transaction as each ledger insert); its CHECK makes
 * negative balances impossible at the database level.
 */

export const up = (pgm) => {
  pgm.createTable('wallet_ledger', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    currency: { type: 'text', notNull: true, check: "currency IN ('zer', 'gems')" },
    /** positive = credit, negative = debit; never zero */
    amount: { type: 'integer', notNull: true, check: 'amount <> 0' },
    reason: { type: 'text', notNull: true },
    /** foreign reference (shop order id, achievement id, admin case id, ...) */
    ref_id: { type: 'text' },
    idempotency_key: { type: 'text', unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('wallet_ledger', ['user_id', 'currency', 'created_at']);

  pgm.createFunction(
    'wallet_ledger_immutable',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `BEGIN RAISE EXCEPTION 'wallet_ledger is append-only'; END;`,
  );
  pgm.createTrigger('wallet_ledger', 'wallet_ledger_no_rewrite', {
    when: 'BEFORE',
    operation: ['UPDATE', 'DELETE'],
    level: 'ROW',
    function: 'wallet_ledger_immutable',
  });

  pgm.createTable('wallet_balances', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    currency: { type: 'text', notNull: true, check: "currency IN ('zer', 'gems')" },
    balance: { type: 'integer', notNull: true, default: 0, check: 'balance >= 0' },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('wallet_balances', 'wallet_balances_pkey', {
    primaryKey: ['user_id', 'currency'],
  });
};

export const down = (pgm) => {
  pgm.dropTable('wallet_balances');
  pgm.dropTrigger('wallet_ledger', 'wallet_ledger_no_rewrite');
  pgm.dropFunction('wallet_ledger_immutable', []);
  pgm.dropTable('wallet_ledger');
};
