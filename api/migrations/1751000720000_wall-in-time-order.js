/**
 * The wall and the library and picture lists show the newest published posts a page at a time, and no index held
 * published posts in that order, so every page sorted every post. These hold them in each list's order: the wall's
 * time and id (a written post's time is when it was published), and the library list's creation time. Built
 * CONCURRENTLY, outside a transaction, so posting goes on during the deploy.
 */

export const up = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS library_posts_wall_idx');
  pgm.sql(
    `CREATE INDEX CONCURRENTLY library_posts_wall_idx ON library_posts ((COALESCE(published_at, created_at)) DESC, id DESC)
      WHERE status = 'published'`,
  );
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS library_posts_published_idx');
  pgm.sql(`CREATE INDEX CONCURRENTLY library_posts_published_idx ON library_posts (created_at DESC) WHERE status = 'published'`);
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS image_posts_wall_idx');
  pgm.sql(`CREATE INDEX CONCURRENTLY image_posts_wall_idx ON image_posts (created_at DESC, id DESC) WHERE status = 'published'`);
};

export const down = (pgm) => {
  pgm.noTransaction();
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS image_posts_wall_idx');
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS library_posts_published_idx');
  pgm.sql('DROP INDEX CONCURRENTLY IF EXISTS library_posts_wall_idx');
};
