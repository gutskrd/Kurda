/**
 * The economy rollup sums one day of the wallet ledger several times a day, and no index led with created_at, so
 * each pass read the whole ledger. The ledger is append-only, so its rows lie in time order and a BRIN index, a few
 * pages for millions of rows, narrows a day to the pages that hold it. Built CONCURRENTLY, outside a transaction,
 * so payments go on during the deploy.
 */

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS wallet_ledger_created_at_brin');
  pgm.sql('CREATE INDEX CONCURRENTLY wallet_ledger_created_at_brin ON wallet_ledger USING brin (created_at) WITH (autosummarize = on)');
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS wallet_ledger_created_at_brin');
};
