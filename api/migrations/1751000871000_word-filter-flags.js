/**
 * Letters and private messages the word filter flags for a moderator (moderation/service.ts): only sexual words and
 * slurs, or anything sent to a minor. What was sent is stored with the listed words masked, so the flag keeps which of
 * the filter's own words matched (`matched`), never the rest of the message, and whether it was sent to a minor
 * (`minor_target`), which raises its case as a minor reporter would.
 */

export const up = (pgm) => {
  pgm.addColumn('moderation_flags', {
    matched: { type: 'text[]' },
    minor_target: { type: 'boolean', notNull: true, default: false },
  });
  // the retention purge reads decided flags by when they were decided
  pgm.createIndex('moderation_flags', ['resolved_at'], { name: 'moderation_flags_decided', where: "status <> 'pending'" });
};

export const down = (pgm) => {
  pgm.dropIndex('moderation_flags', ['resolved_at'], { name: 'moderation_flags_decided' });
  pgm.dropColumn('moderation_flags', ['matched', 'minor_target']);
};
