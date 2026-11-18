/**
 * The unread counts the social rail polls join a member's read marks, and group_reads was keyed by group first, so
 * finding one member's marks read every member's of every group. Built CONCURRENTLY, outside a transaction, so
 * reading goes on during the deploy.
 */

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS group_reads_user_idx');
  pgm.sql('CREATE INDEX CONCURRENTLY group_reads_user_idx ON group_reads (user_id)');
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS group_reads_user_idx');
};
