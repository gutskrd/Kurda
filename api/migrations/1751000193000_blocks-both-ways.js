/**
 * Blocks read from both ends.
 *
 * Whatever somebody wrote is now hidden from anyone they blocked and from
 * anyone who blocked them, so the wall, comments and group chat ask about a
 * block in both directions on every read. The primary key answers "whom did
 * this person block" (blocker_id first); the other direction, "who blocked
 * this person", had only an index on blocked_id, which finds the rows but has
 * to visit the table for the blocker. (blocked_id, blocker_id) answers it
 * from the index alone, and starts with blocked_id, so it serves everything
 * the old single-column index did; that one goes.
 */

export const up = (pgm) => {
  pgm.createIndex('blocks', ['blocked_id', 'blocker_id']);
  pgm.dropIndex('blocks', 'blocked_id');
};

export const down = (pgm) => {
  pgm.createIndex('blocks', 'blocked_id');
  pgm.dropIndex('blocks', ['blocked_id', 'blocker_id']);
};
