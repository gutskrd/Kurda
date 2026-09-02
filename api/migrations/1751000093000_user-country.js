/**
 * Optional profile country: an ISO-3166 alpha-2 code (e.g. 'DE') shown as a flag
 * + name under the username, Steam-style. Additive + reversible; the app maps the
 * code to a flag and a display name, so the DB stores only the compact code.
 */
export const up = (pgm) => {
  pgm.addColumns('users', { country: { type: 'text' } });
  pgm.addConstraint('users', 'users_country_alpha2', {
    check: "country IS NULL OR country ~ '^[A-Z]{2}$'",
  });
};

export const down = (pgm) => {
  pgm.dropConstraint('users', 'users_country_alpha2');
  pgm.dropColumns('users', ['country']);
};
