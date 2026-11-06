/**
 * A learner's solo game rounds, found without reading everybody's.
 *
 * `game_sessions` has two partial indexes that lead with `user_id` — the open
 * round of a game in a variety, and the finished rounds by when — and neither
 * serves a read of every round one learner has, finished or not. Three things
 * do exactly that: erasing an account (gdpr/service.ts), the progress export
 * (gdpr/progress-export.ts), and the foreign key to `users`, whose ON DELETE checks
 * every row. Rounds are kept for 90 days, so each of those was a scan of the
 * whole table; with this index each is a look at that learner's own rows.
 *
 * Built CONCURRENTLY, so the old server keeps making and finishing rounds
 * while the new one migrates; that cannot run inside a transaction, hence
 * noTransaction(), and a failed build is dropped first so a second run starts
 * clean.
 */

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS game_sessions_user_idx');
  pgm.sql('CREATE INDEX CONCURRENTLY game_sessions_user_idx ON game_sessions (user_id)');
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS game_sessions_user_idx');
};
