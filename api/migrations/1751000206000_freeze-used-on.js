/**
 * The day a streak freeze last kept a learner's run going.
 *
 * A freeze is spent by itself when exactly one day was missed (streaks/
 * streak-logic.ts `settle`), and until now nothing was kept of it: the run
 * simply went on, and the learner never learned that a freeze had saved it,
 * nor that it was gone. The apps read this (through the streak summary on
 * GET /me) to say so once, on the next visit.
 *
 * Nullable with no default, so adding it only changes the catalogue.
 */

export const up = (pgm) => {
  pgm.addColumns('user_streaks', {
    freeze_used_on: { type: 'date' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('user_streaks', ['freeze_used_on']);
};
