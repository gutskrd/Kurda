/**
 * Pictures on written posts: a gotin, a çîrok or a helbest can carry up to four.
 *
 * Words and pictures were two kinds of post in two tables, and the composer
 * made people choose one before they could start. A written post now takes
 * pictures as well, X-style, so a photo with a few lines under it is one post.
 * `image_posts` stays as it is for the picture posts already made (they are
 * still read, commented on, reported and erased as before); new posts are
 * always written posts.
 *
 * Each picture is a media upload (the post's author's own, scanned clean and
 * used by no other post — the service checks that, since it spans tables) in a
 * position 0–3, with optional alt text and the size it was stored at, so a
 * wall can lay it out before it loads. A media key belongs to one post at
 * most, which the unique index holds to.
 *
 * `is_meme` marks a post with pictures for the Memes filter (a meme with no
 * picture is not one; the service refuses it). The text may now be empty when
 * the post has a picture — "words or a picture" spans both tables too, so the
 * service holds it; the body column stays NOT NULL and holds ''.
 */

export const up = (pgm) => {
  pgm.createTable(
    'library_post_media',
    {
      post_id: { type: 'uuid', notNull: true, references: 'library_posts', onDelete: 'CASCADE' },
      position: { type: 'smallint', notNull: true, check: 'position BETWEEN 0 AND 3' },
      media_key: { type: 'text', notNull: true },
      alt_text: { type: 'text', check: 'char_length(alt_text) <= 1000' },
      width: { type: 'integer' },
      height: { type: 'integer' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    },
    { constraints: { primaryKey: ['post_id', 'position'] } },
  );
  pgm.createIndex('library_post_media', 'media_key', { unique: true, name: 'library_post_media_key_unique' });

  pgm.addColumns('library_posts', {
    is_meme: { type: 'boolean', notNull: true, default: false },
  });
};

export const down = (pgm) => {
  // a post that was only its pictures has nothing to show in the old shape
  pgm.sql(`DELETE FROM library_posts WHERE body = ''`);
  pgm.dropColumns('library_posts', ['is_meme']);
  pgm.dropTable('library_post_media');
};
