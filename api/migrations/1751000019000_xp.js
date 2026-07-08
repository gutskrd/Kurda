/**
 * XP (KUR-030). xp_ledger is the append-only source of truth — every
 * award is a row (source, amount, ref_id, timestamp), never just a
 * mutable counter. users.xp is a materialized total maintained in the
 * same transaction as the ledger insert. Weekly/period sums for leagues
 * and leaderboards (KUR-062/#63) derive from the ledger.
 *
 * (source, ref_id) is unique so an award tied to a specific event
 * (e.g. a lesson session) can never be granted twice.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    xp: { type: 'integer', notNull: true, default: 0 },
  });

  pgm.createTable('xp_ledger', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    source: { type: 'text', notNull: true },
    amount: { type: 'integer', notNull: true, check: 'amount > 0' },
    ref_id: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('xp_ledger', ['user_id', 'created_at']);
  // NULL ref_ids are distinct, so sources without a ref just append
  pgm.addConstraint('xp_ledger', 'xp_ledger_source_ref_uniq', { unique: ['source', 'ref_id'] });

  // append-only: reject rewrites of history. DELETE is allowed only under
  // the transaction-scoped admin flag (SET LOCAL kurda.ledger_admin = 'on')
  // so account hard-deletion (users FK cascade) stays possible while casual
  // rewrites stay impossible — same convention as wallet_ledger (KUR-066).
  pgm.createFunction(
    'xp_ledger_immutable',
    [],
    { returns: 'trigger', language: 'plpgsql', replace: true },
    `BEGIN
       IF TG_OP = 'DELETE' AND current_setting('kurda.ledger_admin', true) = 'on' THEN
         RETURN OLD;
       END IF;
       RAISE EXCEPTION 'xp_ledger is append-only';
     END;`,
  );
  pgm.createTrigger('xp_ledger', 'xp_ledger_no_rewrite', {
    when: 'BEFORE',
    operation: ['UPDATE', 'DELETE'],
    level: 'ROW',
    function: 'xp_ledger_immutable',
  });
};

export const down = (pgm) => {
  pgm.dropTrigger('xp_ledger', 'xp_ledger_no_rewrite');
  pgm.dropFunction('xp_ledger_immutable', []);
  pgm.dropTable('xp_ledger');
  pgm.dropColumns('users', ['xp']);
};
