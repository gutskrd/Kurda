/**
 * Whether someone takes part in the weekly leagues.
 *
 * Until now everybody was put in a league on their first XP of the week, with
 * no way out. A leaderboard suits some learners and puts others off learning,
 * so it is one tap to leave and one tap to come back.
 *
 * NULL means "never chose", and the default is read from age at the time it is
 * asked: in for adults, out for minors, who can still choose to join. Storing
 * the default instead would freeze it on the day it was written, which is the
 * mistake `restricted_mode` made.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    leagues_enabled: { type: 'boolean' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['leagues_enabled']);
};
