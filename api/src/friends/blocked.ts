/**
 * SQL: neither of `a` and `b` (uuid expressions, always literals from this codebase) has blocked the other. A block
 * hides two people from each other whoever placed it, so every read of posts, comments or messages asks this about
 * author and reader. Two NOT EXISTS rather than one with an OR: each is a single probe on the primary key or its
 * mirror, which the planner can turn into an anti-join over the reader's few blocks. A NULL on either side (a
 * signed-out reader) blocks nobody.
 */
export function notBlockedSql(a: string, b: string): string {
  return `(NOT EXISTS (SELECT 1 FROM blocks blk WHERE blk.blocker_id = ${a} AND blk.blocked_id = ${b})
       AND NOT EXISTS (SELECT 1 FROM blocks blk WHERE blk.blocker_id = ${b} AND blk.blocked_id = ${a}))`;
}
