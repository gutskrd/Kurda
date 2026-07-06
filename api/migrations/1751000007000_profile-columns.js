/**
 * Profile fields (KUR-020): bio (plain text, sanitized app-side) and
 * username_changed_at backing the once-per-30-days rename rule.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    bio: { type: 'text' },
    username_changed_at: { type: 'timestamptz' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['bio', 'username_changed_at']);
};
