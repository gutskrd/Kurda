/**
 * Threaded comments on library posts (KUR-283). A comment is text, audio, or
 * both (>= 1 required, relaxed for tombstones). `parent_comment_id` forms an
 * unbounded reply tree; the thread is fetched top-level-first with per-branch
 * load-more. Soft-delete leaves a tombstone so a removed parent keeps its
 * subtree. `depth` is cached for render capping; counts are maintained on the
 * post (comment_count) and parent (reply_count).
 */

export const up = (pgm) => {
  pgm.createTable('library_comments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    post_id: { type: 'uuid', notNull: true, references: 'library_posts', onDelete: 'CASCADE' },
    author_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    author_role: { type: 'text', notNull: true, check: "author_role IN ('user','admin')" },
    parent_comment_id: { type: 'uuid', references: 'library_comments', onDelete: 'CASCADE' },
    depth: { type: 'integer', notNull: true, default: 0 },
    body: { type: 'text' },
    audio_media_id: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'visible', check: "status IN ('visible','removed')" },
    reply_count: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // a live comment must carry content; a tombstone (removed) may be empty
  pgm.addConstraint('library_comments', 'library_comments_has_content', {
    check: "status = 'removed' OR body IS NOT NULL OR audio_media_id IS NOT NULL",
  });

  // thread reads: top-level of a post (newest), and a parent's direct replies
  pgm.createIndex('library_comments', ['post_id', 'parent_comment_id', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('library_comments');
};
