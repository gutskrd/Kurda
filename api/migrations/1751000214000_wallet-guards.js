/**
 * The wallet's limits, held by the database as well as by WalletService.
 *
 * The ledger already refuses UPDATE and DELETE (migration 1751000014000) and a
 * balance can never go below zero; what it did not refuse was an amount or a
 * balance of any size, a ledger row without a reason, or a TRUNCATE, which
 * row triggers never see. Each of those is closed here:
 *
 * - one ledger row moves at most 10,000,000 either way — the dearest price the
 *   shop accepts (shop/routes.ts) — and never zero (as before);
 * - every ledger row says why, in a code of at most 100 characters;
 * - a balance stays at or under 1,000,000,000, far beyond anything earned by
 *   playing and far enough under the integer column's limit that arithmetic
 *   near it is never the thing that fails;
 * - TRUNCATE of the ledger is refused, as UPDATE and DELETE are.
 *
 * WalletService checks the same bounds first and refuses with an answer of
 * its own; these are the backstop for anything that reaches the tables by
 * another way.
 *
 * Each CHECK is added NOT VALID (a moment's lock, and every new row is checked
 * from then on) and then validated against the rows already there, under a
 * lock that lets the old server go on paying and charging while this runs.
 * That needs each statement to commit on its own, hence noTransaction(), and
 * every step tolerates a second run after a failed first one.
 */

const CHECKS = [
  ['wallet_ledger', 'wallet_ledger_amount_bounds', 'amount BETWEEN -10000000 AND 10000000'],
  ['wallet_ledger', 'wallet_ledger_reason_present', 'char_length(reason) BETWEEN 1 AND 100'],
  ['wallet_balances', 'wallet_balances_ceiling', 'balance <= 1000000000'],
];

export const up = (pgm) => {
  pgm.noTransaction();
  for (const [table, name, check] of CHECKS) {
    pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
    pgm.sql(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${check}) NOT VALID`);
    pgm.sql(`ALTER TABLE ${table} VALIDATE CONSTRAINT ${name}`);
  }
  pgm.sql(`CREATE OR REPLACE FUNCTION wallet_ledger_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'wallet_ledger is append-only';
    END;
  $$`);
  pgm.sql(`DROP TRIGGER IF EXISTS wallet_ledger_no_truncate ON wallet_ledger`);
  pgm.sql(
    `CREATE TRIGGER wallet_ledger_no_truncate BEFORE TRUNCATE ON wallet_ledger FOR EACH STATEMENT EXECUTE FUNCTION wallet_ledger_no_truncate()`,
  );
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql(`DROP TRIGGER IF EXISTS wallet_ledger_no_truncate ON wallet_ledger`);
  pgm.sql(`DROP FUNCTION IF EXISTS wallet_ledger_no_truncate()`);
  for (const [table, name] of CHECKS) pgm.sql(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${name}`);
};
