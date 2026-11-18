/** The daily goal: the XP choices and the status the server sends. */

export const GOAL_OPTIONS = [10, 20, 30, 50] as const;
export type GoalOption = (typeof GOAL_OPTIONS)[number];

export interface DailyGoalStatus {
  goal: GoalOption;
  effectiveGoal: GoalOption;
  earnedXp: number;
  progress: number;
  completed: boolean;
}
