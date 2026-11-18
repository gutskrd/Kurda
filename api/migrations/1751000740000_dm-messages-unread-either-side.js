/**
 * The badges' unread count (GET /chat/unread) looks up a reader's unread messages from both sides of each pair, and
 * the partial index of unread messages led only by user_lo, so the user_hi side read every unread message anyone had.
 * One led by user_hi makes it a look at one's own. Built CONCURRENTLY, outside a transaction, so sending and reading go
 * on during the deploy.
 */

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS dm_messages_unread_hi_idx');
  pgm.sql('CREATE INDEX CONCURRENTLY dm_messages_unread_hi_idx ON dm_messages (user_hi, user_lo, sender_id) WHERE read_at IS NULL');
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS dm_messages_unread_hi_idx');
};
