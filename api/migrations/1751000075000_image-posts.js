/**
 * Community image & meme sharing (KUR-290). Content model + upload API for
 * images (memes first-class) that users, admins, and the founder publish and
 * guests view. The image (a confirmed media key from #013) is required; caption
 * optional. Feed/UI is #291; moderation (report + auto image-scan #294) is #292.
 */

export const up = (pgm) => {
  pgm.createTable('image_posts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    author_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    author_role: { type: 'text', notNull: true, check: "author_role IN ('user','admin','founder')" },
    image_media_id: { type: 'text', notNull: true }, // confirmed media key (#013)
    caption: { type: 'text' },
    category: { type: 'text', notNull: true, default: 'meme', check: "category IN ('meme','image')" },
    language: { type: 'text' },
    status: { type: 'text', notNull: true, default: 'published', check: "status IN ('published','removed')" },
    view_count: { type: 'integer', notNull: true, default: 0 },
    reaction_count: { type: 'integer', notNull: true, default: 0 },
    comment_count: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // browse feeds: published, by category/language, newest or most-viewed
  pgm.createIndex('image_posts', ['status', 'category', 'created_at']);
  pgm.createIndex('image_posts', ['status', 'view_count']);
  pgm.createIndex('image_posts', ['author_id', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('image_posts');
};
