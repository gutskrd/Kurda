/**
 * The all-time XP board, read in order rather than sorted.
 *
 * The board ranks `users.xp`, the XP total kept beside the ledger, and lists
 * the top thousand (leaderboards/service.ts). Without an index a build would
 * read every account and sort them; this one holds positive totals highest
 * first, ties by id the way a sorted set breaks them, so a build reads them in
 * order and stops once it has the board.
 *
 * Built CONCURRENTLY, so the old server keeps paying XP while the new one
 * migrates; that cannot run inside a transaction, hence noTransaction(), and a
 * failed build is dropped first so a second run starts clean.
 */

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS users_xp_board_idx');
  pgm.sql('CREATE INDEX CONCURRENTLY users_xp_board_idx ON users (xp DESC, id DESC) WHERE xp > 0');
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS users_xp_board_idx');
};
