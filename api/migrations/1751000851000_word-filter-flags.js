/**
 * Letters and private messages the word filter flags go to the moderation queue as text flags (moderation/service.ts).
 * What was sent is stored with the listed words masked, so the flag keeps which of the filter's own words matched, for
 * the moderator to judge how bad it was: words from the list, never the rest of the message.
 */

export const up = (pgm) => {
  pgm.addColumn('moderation_flags', {
    matched: { type: 'text[]' },
  });
};

export const down = (pgm) => {
  pgm.dropColumn('moderation_flags', 'matched');
};
