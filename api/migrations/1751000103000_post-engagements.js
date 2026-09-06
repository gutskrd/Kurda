/**
 * Likes and bookmarks, across every kind of post.
 *
 * Stories, poems and pictures now share one feed, so they need one way to be
 * liked and one way to be saved — a per-type table would mean the feed asking
 * two questions to render one row of buttons, and two code paths to keep in
 * step.
 *
 * The target is (type, id) rather than a foreign key, because no single table
 * holds both `library_posts` and `image_posts`. That trades referential
 * integrity for a shared feed; the trade is safe because every read starts from
 * a live post and joins engagement onto it, so a row left behind by a deleted
 * post is invisible rather than wrong. `sweepOrphans` in the service clears them
 * when a post is removed, and nothing depends on that having run.
 */

export const up = (pgm) => {
  pgm.createTable('post_engagements', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    target_type: { type: 'text', notNull: true, check: "target_type IN ('library','image')" },
    target_id: { type: 'uuid', notNull: true },
    kind: { type: 'text', notNull: true, check: "kind IN ('like','bookmark')" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // one like and one bookmark per person per post; a second click removes it
  pgm.addConstraint('post_engagements', 'post_engagements_pkey', {
    primaryKey: ['user_id', 'target_type', 'target_id', 'kind'],
  });

  // "how many likes does this post have", the feed's hottest question
  pgm.createIndex('post_engagements', ['target_type', 'target_id', 'kind']);
  // "what have I liked / saved", newest first — your own lists and your profile
  pgm.createIndex('post_engagements', ['user_id', 'kind', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('post_engagements');
};
