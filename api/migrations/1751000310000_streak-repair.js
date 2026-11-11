/**
 * Restoring a streak that ended.
 *
 * When a run ends, user_streaks set its count to 0 and kept nothing else of
 * it, so there was no saying afterwards how long it had been. Three columns
 * now remember the run that last ended: its length, its last day (the
 * learner's own calendar day, as last_active_on is), and the day it was
 * restored on once it has been. They are written where the run is ended
 * (streaks/streak-logic.ts `settle`) and read to make the offer the apps show
 * for a few days afterwards (shared streak-repair.ts holds the rules).
 *
 * streak_repairs is the record of each restore: which run, how long it was,
 * what it cost, and the learner's day it happened on. One row per ended run
 * (the primary key), which is what makes a second request for the same run
 * find the first instead of restoring or charging again; the gems go through
 * wallet_ledger under a key naming the same run. A free restore — a Hevalo+
 * member has one a calendar month — moves no gems and so leaves no ledger
 * row: this table is where the month's free ones are counted. The days a
 * restore kept run from the day after ended_last_active_on to the day before
 * repaired_on, which is how the week row shows them as kept.
 *
 * The new columns are nullable or carry a constant default, so adding them
 * only changes the catalogue.
 */

export const up = (pgm) => {
  pgm.addColumns('user_streaks', {
    ended_streak: { type: 'integer', notNull: true, default: 0, check: 'ended_streak >= 0' },
    ended_last_active_on: { type: 'date' },
    ended_restored_on: { type: 'date' },
  });

  pgm.createTable('streak_repairs', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    /** the last day of the run that was restored: with the learner, it names the run */
    ended_last_active_on: { type: 'date', notNull: true },
    days: { type: 'integer', notNull: true, check: 'days > 0' },
    cost_gems: { type: 'integer', notNull: true, check: 'cost_gems >= 0' },
    free: { type: 'boolean', notNull: true },
    /** the learner's calendar day of the restore */
    repaired_on: { type: 'date', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('streak_repairs', 'streak_repairs_pkey', { primaryKey: ['user_id', 'ended_last_active_on'] });
  pgm.addConstraint('streak_repairs', 'streak_repairs_free_costs_nothing', { check: '(free AND cost_gems = 0) OR (NOT free AND cost_gems > 0)' });
};

export const down = (pgm) => {
  pgm.dropTable('streak_repairs');
  pgm.dropColumns('user_streaks', ['ended_streak', 'ended_last_active_on', 'ended_restored_on']);
};
