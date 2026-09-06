/**
 * A third kind of written post: the gotin.
 *
 * Çîrok and helbest are pieces of work — they are titled, and people go looking
 * for them by name. A gotin is a saying: a line or two, posted and read in
 * passing. Making someone title one before they can post it would turn a
 * throwaway thought into a chore, so `title` becomes optional — but only for a
 * gotin. A story or a poem without a name is still a mistake, and the check
 * keeps saying so.
 */

export const up = (pgm) => {
  pgm.dropConstraint('library_posts', 'library_posts_type_check');
  pgm.addConstraint('library_posts', 'library_posts_type_check', {
    check: "type IN ('gotin','story','poem')",
  });

  pgm.alterColumn('library_posts', 'title', { notNull: false });
  pgm.addConstraint('library_posts', 'library_posts_title_required', {
    check: "type = 'gotin' OR title IS NOT NULL",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('library_posts', 'library_posts_title_required');
  // a gotin has no place in the old shape, and neither does a null title
  pgm.sql(`DELETE FROM library_posts WHERE type = 'gotin' OR title IS NULL`);
  pgm.alterColumn('library_posts', 'title', { notNull: true });
  pgm.dropConstraint('library_posts', 'library_posts_type_check');
  pgm.addConstraint('library_posts', 'library_posts_type_check', {
    check: "type IN ('story','poem')",
  });
};
