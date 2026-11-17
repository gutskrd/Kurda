/**
 * A person's direct messages, found from either side of the pair.
 *
 * A conversation is keyed by its two people in id order (user_lo < user_hi),
 * and the only index that leads with them was (user_lo, user_hi, created_at).
 * The conversation list — the Messages tab, and the unread badge it keeps,
 * read again each time a message arrives — asks for `user_lo = me OR
 * user_hi = me`. The first half was a look at one's own rows; the second, for
 * everybody whose id sorts above their partner's, walked that whole index,
 * every message anyone has ever sent. Leading with user_hi makes the second
 * half a look at one's own rows too, and serves the foreign key to `users`,
 * whose ON DELETE checks every row on that side.
 *
 * And the unread count of each conversation on that list read every message
 * in it to find the few nobody has read yet. Messages are read soon after
 * they arrive, so an index of only the unread ones stays small, and the count
 * (and marking a conversation read) is a look at those alone. `read_at` is
 * already in an index (sender_id, read_at), so marking messages read was never
 * an in-place update and this one costs it nothing more.
 *
 * Built CONCURRENTLY, so the old server keeps sending and reading messages
 * while the new one migrates; that cannot run inside a transaction, hence
 * noTransaction(), and a failed build is dropped first so a second run starts
 * clean.
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
