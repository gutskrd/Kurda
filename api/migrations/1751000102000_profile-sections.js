/**
 * What a person chooses to show on their profile.
 *
 * A JSONB bag rather than a column per section: sections get added (game modes,
 * new kinds of post) and each one would otherwise be a migration. Absent keys
 * mean "the default", so an existing account shows everything without a
 * backfill, and a section added later is on for everyone until they say
 * otherwise.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    profile_sections: { type: 'jsonb', notNull: true, default: '{}' },
  });
};

export const down = (pgm) => {
  pgm.dropColumns('users', ['profile_sections']);
};
