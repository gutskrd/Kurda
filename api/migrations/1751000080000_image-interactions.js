/**
 * Reactions & threaded comments on image/meme posts (KUR-291).
 *
 * `image_reactions` is one row per (post, user) — a user has at most one active
 * reaction on a post; changing it updates the row, removing it deletes it. The
 * post's `reaction_count` is kept in step inside each mutation. A partial index on
 * (post_id, reaction) powers the per-emoji breakdown.
 *
 * `image_comments` mirrors the library comment model (KUR-283): a `parent_comment_id`
 * reply tree, `depth` cached for render capping, soft-delete tombstones so a removed
 * parent keeps its subtree, and `comment_count` (post) / `reply_count` (parent) kept
 * in step. Text-only (no audio) — memes are visual.
 */

const REACTIONS = ['like', 'laugh', 'love', 'wow', 'sad', 'angry'];

export const up = (pgm) => {
  pgm.createTable('image_reactions', {
    post_id: { type: 'uuid', notNull: true, references: 'image_posts', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    reaction: { type: 'text', notNull: true, check: `reaction IN (${REACTIONS.map((r) => `'${r}'`).join(',')})` },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('image_reactions', 'image_reactions_pkey', { primaryKey: ['post_id', 'user_id'] });
  // per-emoji breakdown for a post
  pgm.createIndex('image_reactions', ['post_id', 'reaction']);

  pgm.createTable('image_comments', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    post_id: { type: 'uuid', notNull: true, references: 'image_posts', onDelete: 'CASCADE' },
    author_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    author_role: { type: 'text', notNull: true, check: "author_role IN ('user','admin','founder')" },
    parent_comment_id: { type: 'uuid', references: 'image_comments', onDelete: 'CASCADE' },
    depth: { type: 'integer', notNull: true, default: 0 },
    body: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'visible', check: "status IN ('visible','removed')" },
    reply_count: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  // a live comment must carry text; a tombstone (removed) may be empty
  pgm.addConstraint('image_comments', 'image_comments_has_content', {
    check: "status = 'removed' OR body IS NOT NULL",
  });
  // thread reads: top-level of a post (newest), and a parent's direct replies
  pgm.createIndex('image_comments', ['post_id', 'parent_comment_id', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('image_comments');
  pgm.dropTable('image_reactions');
};
