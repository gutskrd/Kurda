/**
 * Daily goals (KUR-032). A learner picks a daily XP target (10/20/30/50);
 * users.daily_goal holds the current setting.
 *
 * daily_goals records, per local day, the goal that was actually in force
 * and when it was met. The stored value is the MINIMUM goal in effect at
 * any point that day (see the edge case): raising the goal mid-day never
 * claws back progress, and completion is credited going forward only.
 */

export const up = (pgm) => {
  pgm.addColumns('users', {
    daily_goal: {
      type: 'integer',
      notNull: true,
      default: 20,
      check: 'daily_goal IN (10, 20, 30, 50)',
    },
  });

  pgm.createTable('daily_goals', {
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    /** local calendar date (user tz) this row is for */
    goal_date: { type: 'date', notNull: true },
    /** the lowest goal in force this day — what today is judged against */
    effective_goal: { type: 'integer', notNull: true, check: 'effective_goal IN (10, 20, 30, 50)' },
    completed_at: { type: 'timestamptz' },
    /** Zêr reward granted? stays false until the reward is wired (KUR-067) */
    reward_granted: { type: 'boolean', notNull: true, default: false },
  });
  pgm.addConstraint('daily_goals', 'daily_goals_pkey', { primaryKey: ['user_id', 'goal_date'] });
};

export const down = (pgm) => {
  pgm.dropTable('daily_goals');
  pgm.dropColumns('users', ['daily_goal']);
};
