/**
 * User search + public profiles (KUR-082). `profile_visibility` controls who
 * can see a profile (everyone / friends / nobody). The functional index folds
 * Kurdish diacritics (ê î û ç ş → e i u c s) and lowercases, matching the
 * dictionary's KUR-044 normalization, so prefix search finds "sê"/"şev" from
 * "se" and stays index-backed.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    profile_visibility: { type: 'text', notNull: true, default: 'everyone' },
  });
  pgm.addConstraint('users', 'users_profile_visibility_check', {
    check: "profile_visibility IN ('everyone','friends','nobody')",
  });
  pgm.sql(
    `CREATE INDEX users_username_folded_idx
       ON users (translate(lower(username::text), 'êîûçş', 'eiucs') text_pattern_ops)`,
  );
};

export const down = (pgm) => {
  pgm.sql('DROP INDEX IF EXISTS users_username_folded_idx');
  pgm.dropColumns('users', ['profile_visibility']);
};
