/**
 * "Source / credit" under a post.
 *
 * Quoting a poet, or posting a picture somebody else made, is fine when it says
 * whose it is. An optional line of up to 200 characters, shown under the post,
 * gives that a place of its own instead of the end of the text.
 */

export const up = (pgm) => {
  pgm.addColumns('library_posts', {
    source_credit: { type: 'text', check: 'char_length(source_credit) <= 200' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('library_posts', ['source_credit']);
};
