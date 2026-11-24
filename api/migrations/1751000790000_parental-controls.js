/**
 * Parental controls: a parent's link to a teen's account and the limits they set on it (shared/src/parental.ts).
 *
 * - `parental_codes`: the one code a parent has out at a time, kept only as a keyed hash; a new code replaces the row,
 *   so the old one stops working, and a code works once, for a day.
 * - `parental_links`: who looks after whom. A link ends rather than going away, saying how (a parent, the teen, the
 *   18th birthday, or the parent's account barred), so both sides' exports can say what happened; one live link per
 *   pair, and the teen's live links are what every guard reads. A teen's request to leave is kept as the time they
 *   asked, since the link ends a set number of days after it.
 * - `parental_controls`: the teen's limits, one row whichever parent set them, with the time zone their day and bedtime
 *   are counted in, when it last changed, and when the last minute was counted; and when the first parent corrected
 *   the teen's birth month, and who, since that is done once for good, whichever parents come and go.
 * - `parental_usage`: minutes the app was open in front of the teen, per local day, kept about five weeks.
 */

export const up = (pgm) => {
  pgm.createTable('parental_codes', {
    parent_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
    code_hash: { type: 'text', notNull: true, unique: true },
    expires_at: { type: 'timestamptz', notNull: true },
    used_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable(
    'parental_links',
    {
      id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
      parent_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
      teen_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
      created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      ended_at: { type: 'timestamptz' },
      ended_by: { type: 'text', check: "ended_by IN ('parent','teen','age','account')" },
      leave_requested_at: { type: 'timestamptz' },
    },
    {
      constraints: {
        check: ['parent_id <> teen_id', '(ended_at IS NULL) = (ended_by IS NULL)'],
      },
    },
  );
  // Neither side is connected twice; the pair index also serves a parent's live teens.
  pgm.createIndex('parental_links', ['parent_id', 'teen_id'], { unique: true, where: 'ended_at IS NULL', name: 'parental_links_live_pair' });
  // What every guard and GET /me ask: whether this teen has a live link.
  pgm.createIndex('parental_links', 'teen_id', { where: 'ended_at IS NULL', name: 'parental_links_live_teen' });
  // Ended links too, for an export and an erasure, and for the cascade.
  pgm.createIndex('parental_links', 'parent_id');
  pgm.createIndex('parental_links', 'teen_id');

  pgm.createTable(
    'parental_controls',
    {
      teen_id: { type: 'uuid', primaryKey: true, references: 'users', onDelete: 'CASCADE' },
      daily_limit_minutes: { type: 'integer', check: 'daily_limit_minutes BETWEEN 1 AND 1440' },
      bedtime_from: { type: 'text' },
      bedtime_to: { type: 'text' },
      chat: { type: 'boolean', notNull: true, default: true },
      letters: { type: 'boolean', notNull: true, default: true },
      posts: { type: 'boolean', notNull: true, default: true },
      games: { type: 'boolean', notNull: true, default: true },
      friends: { type: 'boolean', notNull: true, default: true },
      purchases: { type: 'boolean', notNull: true, default: true },
      time_zone: { type: 'text', notNull: true, default: 'UTC' },
      time_zone_changed_at: { type: 'timestamptz' },
      last_beat_at: { type: 'timestamptz' },
      updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
      birth_corrected_at: { type: 'timestamptz' },
      // Cleared when that parent's account goes; the time stays, so the one correction stays used.
      birth_corrected_by: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    },
    {
      constraints: {
        check: [
          '(bedtime_from IS NULL) = (bedtime_to IS NULL)',
          "bedtime_from IS NULL OR (bedtime_from ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND bedtime_to ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')",
        ],
      },
    },
  );

  pgm.createTable('parental_usage', {
    teen_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    day: { type: 'date', notNull: true },
    minutes: { type: 'integer', notNull: true, default: 0, check: 'minutes BETWEEN 0 AND 1440' },
  });
  pgm.addConstraint('parental_usage', 'parental_usage_pkey', { primaryKey: ['teen_id', 'day'] });
  // the daily prune of days past keeping
  pgm.createIndex('parental_usage', 'day');
};

export const down = (pgm) => {
  pgm.dropTable('parental_usage');
  pgm.dropTable('parental_controls');
  pgm.dropTable('parental_links');
  pgm.dropTable('parental_codes');
};
