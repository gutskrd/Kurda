/**
 * A rung between 'everyone' and 'friends': visible to anyone with an account.
 *
 * When profiles were only reachable behind a login, 'everyone' meant every
 * member. Opening the app to signed-out visitors quietly changed that to mean
 * the open web, for every account that had ever chosen it — a wider audience
 * than anyone consented to.
 *
 * So existing 'everyone' rows become 'members', which is what those people
 * actually agreed to, and 'everyone' is left as an opt-in for anyone who does
 * want a profile the public web can read. New accounts default to 'members'
 * for the same reason: the safer rung is the one you get without choosing.
 */

const OLD = ['everyone', 'friends', 'nobody'];
const NEW = ['everyone', 'members', 'friends', 'nobody'];

const check = (values) => `profile_visibility IN (${values.map((v) => `'${v}'`).join(',')})`;

export const up = (pgm) => {
  // widen the constraint first — the rewrite below writes a value it forbids
  pgm.dropConstraint('users', 'users_profile_visibility_check');
  pgm.addConstraint('users', 'users_profile_visibility_check', { check: check(NEW) });
  pgm.sql(`UPDATE users SET profile_visibility = 'members' WHERE profile_visibility = 'everyone'`);
  pgm.alterColumn('users', 'profile_visibility', { default: 'members' });
};

export const down = (pgm) => {
  pgm.sql(`UPDATE users SET profile_visibility = 'everyone' WHERE profile_visibility = 'members'`);
  pgm.alterColumn('users', 'profile_visibility', { default: 'everyone' });
  pgm.dropConstraint('users', 'users_profile_visibility_check');
  pgm.addConstraint('users', 'users_profile_visibility_check', { check: check(OLD) });
};
