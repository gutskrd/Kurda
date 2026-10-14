/**
 * Leaving this week's league keeps your place in it.
 *
 * Opting out deleted the week's `league_members` row, and opting back in
 * placed the user afresh — in the oldest cohort with room, or a new one. Two
 * taps late in the week therefore swapped a strong cohort for an emptier one,
 * and a top-ten finish there paid a promotion and its Gems.
 *
 * The row now stays, marked with when they left. Standings and settlement
 * leave out anyone who has left; coming back in the same week clears the mark
 * and puts them back where they were.
 */

export const up = (pgm) => {
  pgm.addColumns('league_members', {
    left_at: { type: 'timestamptz' },
  });
};

export const down = (pgm) => {
  pgm.sql(`DELETE FROM league_members WHERE left_at IS NOT NULL`);
  pgm.dropColumns('league_members', ['left_at']);
};
