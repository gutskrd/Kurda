/**
 * The conversation list asks for `user_lo = me OR user_hi = me`, and only
 * user_lo led an index, so the second half walked every message anyone had
 * sent; one leading with user_hi makes it a look at one's own rows (and serves
 * the foreign key's ON DELETE). Each conversation's unread count reads only
 * the unread rows through the partial index. Built CONCURRENTLY, outside a
 * transaction, so sending and reading go on during the deploy.
 */

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS dm_messages_hi_idx');
  pgm.sql('CREATE INDEX CONCURRENTLY dm_messages_hi_idx ON dm_messages (user_hi, user_lo, created_at)');
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS dm_messages_unread_idx');
  pgm.sql('CREATE INDEX CONCURRENTLY dm_messages_unread_idx ON dm_messages (user_lo, user_hi, sender_id) WHERE read_at IS NULL');
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS dm_messages_unread_idx');
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS dm_messages_hi_idx');
};
