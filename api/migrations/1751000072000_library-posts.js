/**
 * Community library: stories & poems (KUR-281). A shared library of Kurdish
 * literature that admins and signed-in users publish; guests read/listen.
 * Each post is text (required) with an OPTIONAL audio rendition referenced by a
 * media key (#013). Comments live in #283; moderation/removal in #285.
 */

export const up = (pgm) => {
  pgm.createTable('library_posts', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    author_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    author_role: { type: 'text', notNull: true, check: "author_role IN ('user','admin')" },
    type: { type: 'text', notNull: true, check: "type IN ('story','poem')" },
    title: { type: 'text', notNull: true },
    body: { type: 'text', notNull: true },
    // optional voice rendition — a confirmed media upload key (#013)
    audio_media_id: { type: 'text' },
    language: { type: 'text', notNull: true, default: 'kmr' },
    status: {
      type: 'text',
      notNull: true,
      default: 'published',
      check: "status IN ('draft','published','removed')",
    },
    view_count: { type: 'integer', notNull: true, default: 0 },
    comment_count: { type: 'integer', notNull: true, default: 0 },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    published_at: { type: 'timestamptz' },
  });

  // browse feeds: published, filter by type/language, newest or most-viewed
  pgm.createIndex('library_posts', ['status', 'type', 'created_at']);
  pgm.createIndex('library_posts', ['status', 'view_count']);
  pgm.createIndex('library_posts', ['author_id', 'created_at']);
};

export const down = (pgm) => {
  pgm.dropTable('library_posts');
};
