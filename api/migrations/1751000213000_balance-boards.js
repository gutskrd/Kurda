/**
 * The Zêr and Gewher boards, read in order rather than sorted.
 *
 * A balance board ranks what each person holds now (leaderboards/service.ts)
 * and lists the top thousand. `wallet_balances` is keyed by (user, currency),
 * which finds one person's balance and nothing else: the top of a currency
 * would mean reading every balance there is and sorting them, every time a
 * board is built. This index holds each currency's positive balances highest
 * first, ties by id the way a sorted set breaks them, so a build reads them in
 * order and stops once it has the board. A zero balance is never on a board,
 * so it is left out of the index, which keeps it to the people who hold some.
 *
 * Built CONCURRENTLY, so the old server keeps paying out rewards and taking
 * purchases while the new one migrates; that cannot run inside a transaction,
 * hence noTransaction(), and a failed build is dropped first so a second run
 * starts clean.
 */

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS wallet_balances_board_idx');
  pgm.sql(
    'CREATE INDEX CONCURRENTLY wallet_balances_board_idx ON wallet_balances (currency, balance DESC, user_id DESC) WHERE balance > 0',
  );
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS wallet_balances_board_idx');
};
