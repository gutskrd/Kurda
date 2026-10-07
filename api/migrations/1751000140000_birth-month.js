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
 * that identifies a person outside the app, so it is not kept: the day is
 * cleared from every row.
 *
 * Only an adult's date is folded into the new columns. The old API took any
 * date at all, and nothing ever acted on it, so a stored date can be before
 * 1900 (which the new range check refuses), or a child's: it once made
 * accounts for twelve-year-olds. A date folded in as a minor's or a child's
 * would skip what answering the question does — closing an account under 13,
 * a minor's defaults from 13 to 17 — so those, and anything implausible, are
 * left empty instead, and the account is asked the question like every other
 * account without one. "Adult" here is the app's own rule (@kurda/shared
 * `isMinor`, users/age.ts `minorSql`): the birth month itself still counts as
 * the younger age.
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
           birth_month = extract(month FROM birth_date)::smallint
     WHERE birth_date >= DATE '1900-01-01'
       AND extract(year FROM now() AT TIME ZONE 'UTC')::int - extract(year FROM birth_date)::int
           - CASE WHEN extract(month FROM now() AT TIME ZONE 'UTC')::int <= extract(month FROM birth_date)::int
                  THEN 1 ELSE 0 END >= 18`);
  pgm.sql(`UPDATE users SET birth_date = NULL WHERE birth_date IS NOT NULL`);

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
