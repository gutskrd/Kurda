/**
 * SQL: neither of `a` and `b` (two uuid expressions — columns or
 * placeholders, always literals from this codebase, never input) has blocked
 * the other.
 *
 * A block hides two people from each other whoever placed it, so whatever
 * one of them wrote is not shown to the other: the person who blocked does
 * not want to see it, and the person blocked is not to know what goes on
 * past the block. Every read of somebody's posts, comments or messages asks
 * this about the author and the reader.
 *
 * Two NOT EXISTS rather than one with an OR between the directions: each is a
 * single probe on the primary key (blocker_id, blocked_id) or on its mirror
 * (blocked_id, blocker_id), and the planner can turn either into an anti-join
 * over the few blocks the reader has instead of a lookup per row. A NULL on
 * either side (a signed-out reader) blocks nobody.
 */
export function notBlockedSql(a: string, b: string): string {
  return `(NOT EXISTS (SELECT 1 FROM blocks blk WHERE blk.blocker_id = ${a} AND blk.blocked_id = ${b})
       AND NOT EXISTS (SELECT 1 FROM blocks blk WHERE blk.blocker_id = ${b} AND blk.blocked_id = ${a}))`;
}
