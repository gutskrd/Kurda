/**
 * A notification setting for league and badge news ("progress": a promotion,
 * a badge earned — contract 4 §B2, §U).
 *
 * NULL means "the default for my age", as `streak` does: on for an adult, off
 * for a minor (and for an account whose age is not on record yet), read when it
 * is asked. Only the push waits for the choice; the in-app list always has the
 * news.
 */

export const up = (pgm) => {
  pgm.addColumns('notification_prefs', {
    progress: { type: 'boolean' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('notification_prefs', ['progress']);
};
