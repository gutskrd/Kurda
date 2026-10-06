/**
 * A birth month and year in place of a birth date, and no stored verdict.
 *
 * `birth_date` was optional, only ever asked for by an API no client called,
 * and fed one flag, `restricted_mode`, that was written once at sign-up, never
 * recomputed as people aged and never read. Minor status is now worked out from
 * the birth month whenever it is needed (@kurda/shared `isMinor`), so it ends by
 * itself at 18 instead of being right on the day it was written and wrong ever
 * after.
 *
 * A month and a year are all the age rules need. The day of birth is the part
 * that identifies a person outside the app, so it is not kept: the few existing
 * dates are folded into the new columns and the day is cleared.
 *
 * NULL means "not given yet" — every account made before this, and accounts
 * made through Google or Apple, which are asked once after signing in. The pair
 * is all or nothing.
 *
 * `birth_date` and `restricted_mode` stay as columns for now, unread and
 * unwritten, because the build being replaced still writes them on sign-up for
 * as long as it serves traffic during a deploy. A later migration can drop them.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    birth_year: { type: 'smallint' },
    birth_month: { type: 'smallint' },
  });
  pgm.addConstraint('users', 'users_birth_month_pair', {
    check: '(birth_year IS NULL) = (birth_month IS NULL)',
  });
  pgm.addConstraint('users', 'users_birth_month_range', {
    check: 'birth_month IS NULL OR (birth_month BETWEEN 1 AND 12 AND birth_year >= 1900)',
  });

  pgm.sql(`
    UPDATE users
       SET birth_year = extract(year FROM birth_date)::smallint,
           birth_month = extract(month FROM birth_date)::smallint,
           birth_date = NULL
     WHERE birth_date IS NOT NULL`);

  pgm.sql(
    `COMMENT ON COLUMN users.birth_date IS 'unused: replaced by birth_year + birth_month; drop once no deployed build writes it'`,
  );
  pgm.sql(
    `COMMENT ON COLUMN users.restricted_mode IS 'unused: minor status is derived from birth_year + birth_month; drop once no deployed build writes it'`,
  );
};

export const down = (pgm) => {
  // the day was never kept, so the first of the month is the closest there is
  pgm.sql(`
    UPDATE users SET birth_date = make_date(birth_year, birth_month, 1)
     WHERE birth_year IS NOT NULL AND birth_date IS NULL`);
  pgm.sql(`COMMENT ON COLUMN users.birth_date IS NULL`);
  pgm.sql(`COMMENT ON COLUMN users.restricted_mode IS NULL`);
  pgm.dropConstraint('users', 'users_birth_month_range');
  pgm.dropConstraint('users', 'users_birth_month_pair');
  pgm.dropColumns('users', ['birth_year', 'birth_month']);
};
