/**
 * A streak reminder setting nobody chose is stored as "not chosen".
 *
 * Whether streak reminders are on by default depends on age — off for a
 * minor, on for an adult — and is read at the moment it is asked. But the
 * settings row stored a plain true or false, and saving any other setting
 * wrote the default in as if it had been chosen: a minor who switched off
 * friend notifications had streak reminders frozen off for good, past 18.
 *
 * NULL now means "the default for my age", as `users.leagues_enabled` does,
 * and only an explicit choice is stored as true or false. Existing values
 * stay as they are: for an adult a stored true is the same as the default,
 * and an account found to be a minor's is reset to NULL when its age is
 * recorded.
 */

export const up = (pgm) => {
  pgm.alterColumn('notification_prefs', 'streak', { notNull: false, default: null });
};

export const down = (pgm) => {
  // the default it stood for, worked out the way the app does (users/age.ts)
  pgm.sql(`
    UPDATE notification_prefs p
       SET streak = u.birth_year IS NOT NULL AND (
             extract(year FROM now() AT TIME ZONE 'UTC')::int - u.birth_year
             - CASE WHEN extract(month FROM now() AT TIME ZONE 'UTC')::int <= u.birth_month THEN 1 ELSE 0 END
           ) >= 18
      FROM users u
     WHERE u.id = p.user_id AND p.streak IS NULL`);
  pgm.alterColumn('notification_prefs', 'streak', { notNull: true, default: true });
};
