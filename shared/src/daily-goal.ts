/** The daily XP goal: the targets a learner can pick, and what GET and PUT /me/daily-goal answer. */

export const GOAL_OPTIONS = [10, 20, 30, 50] as const;
export type GoalOption = (typeof GOAL_OPTIONS)[number];

export interface DailyGoalStatus {
  /** The learner's goal setting. */
  goal: GoalOption;
  /** The goal today is judged against: the lower of the old and new settings on a day the goal changed. */
  effectiveGoal: GoalOption;
  earnedXp: number;
  /** 0 to 1. */
  progress: number;
  completed: boolean;
}

export function isGoalOption(n: number): n is GoalOption {
  return (GOAL_OPTIONS as readonly number[]).includes(n);
}
