/** Daily-goal display helpers (KUR-032). Pure, so they're unit-testable. */

export const GOAL_OPTIONS = [10, 20, 30, 50] as const;
export type GoalOption = (typeof GOAL_OPTIONS)[number];

export interface DailyGoalStatus {
  goal: GoalOption;
  effectiveGoal: GoalOption;
  earnedXp: number;
  progress: number;
  completed: boolean;
}

/** Whole-percent label for the ring centre. */
export function goalPercentLabel(progress: number): string {
  return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
}

/**
 * SVG stroke geometry for a progress ring. `strokeDashoffset` shrinks from
 * the full circumference (empty) to 0 (complete) as progress goes 0→1.
 */
export function ringStroke(progress: number, radius: number): { circumference: number; dashoffset: number } {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return { circumference, dashoffset: circumference * (1 - clamped) };
}
