/**
 * A learner's lesson sessions, found without reading everybody's.
 *
 * `lesson_sessions` had an index for one thing only: the unfinished session of
 * a lesson (`lesson_sessions_active`). Every read of what a learner has done —
 * the course map's finished lessons on every visit to Learn, and now the
 * practice hub's finished lessons, units and recent mistakes — went through
 * the whole table, one row for every lesson anybody has ever started. With
 * this index each is a look at that learner's own rows.
 *
 * Built CONCURRENTLY, so the old server keeps starting and finishing lessons
 * while the new one migrates; that cannot run inside a transaction, hence
 * noTransaction(), and a failed build is dropped first so a second run starts
 * clean.
 */

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS lesson_sessions_user_idx');
  pgm.sql('CREATE INDEX CONCURRENTLY lesson_sessions_user_idx ON lesson_sessions (user_id)');
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS lesson_sessions_user_idx');
};
