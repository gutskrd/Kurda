/**
 * Reposting, as a third kind of engagement.
 *
 * A repost is "this belongs on my profile too" — one per person per post,
 * counted on the post, listed newest-first for the person who made it. That is
 * the same shape as a like and a bookmark, down to the queries: the primary key
 * on `post_engagements` already gives one per person per post, and the two
 * indexes already answer "how many does this post have" and "what have I
 * reposted, newest first".
 *
 * So this is not a new table. It is the `kind` check learning one more word —
 * and everything built on that table (the toggle endpoint, the count query, the
 * feed's `engagedBy`) works for reposts without knowing they exist.
 *
 * The original migration cannot be edited — it is merged, and CI enforces that
 * — so the constraint is replaced rather than amended.
 */

const CHECK = 'post_engagements_kind_check';

export const up = (pgm) => {
  pgm.dropConstraint('post_engagements', CHECK);
  pgm.addConstraint('post_engagements', CHECK, {
    check: "kind IN ('like','bookmark','repost')",
  });
};

export const down = (pgm) => {
  // a repost is not a like and not a bookmark, so there is nowhere to put one:
  // going back means the rows go with it
  pgm.sql(`DELETE FROM post_engagements WHERE kind = 'repost'`);
  pgm.dropConstraint('post_engagements', CHECK);
  pgm.addConstraint('post_engagements', CHECK, {
    check: "kind IN ('like','bookmark')",
  });
};
