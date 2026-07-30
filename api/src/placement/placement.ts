/**
 * Adaptive placement logic (KUR-039). Pure — no DB, no content — so the
 * difficulty walk and placed-level rule are exhaustively unit-testable.
 *
 * "Level" is a skill's 1-based position within the course. The test walks
 * levels: harder (+1) on a correct answer, easier (−1) on a wrong one, and
 * stops after a fixed budget. The learner is placed at the highest level
 * they answered correctly — skills up to there are "tested out".
 */

export const PLACEMENT_MAX_QUESTIONS = 12;
export const PLACEMENT_START_LEVEL = 1;

export interface PlacementStep {
  level: number;
  correct: boolean;
}

/** Next difficulty: up on correct, down on wrong, clamped to [1, maxLevel]. */
export function nextLevel(current: number, correct: boolean, maxLevel: number): number {
  const stepped = current + (correct ? 1 : -1);
  return Math.max(1, Math.min(maxLevel, stepped));
}

/**
 * The test ends when the question budget is spent, or early once the walk
 * has clearly settled: the learner missed the top level and can't climb
 * higher (two consecutive wrongs at or above the current ceiling).
 */
export function isComplete(history: PlacementStep[], maxQuestions = PLACEMENT_MAX_QUESTIONS): boolean {
  if (history.length >= maxQuestions) return true;
  if (history.length >= 2) {
    const [a, b] = history.slice(-2);
    if (!a!.correct && !b!.correct && a!.level === 1 && b!.level === 1) return true; // bottomed out
  }
  return false;
}

/**
 * Placed level = the highest level answered correctly (0 if none). Skills
 * with position ≤ this are unlocked / tested out.
 */
export function placedLevel(history: PlacementStep[]): number {
  const correct = history.filter((s) => s.correct).map((s) => s.level);
  return correct.length ? Math.max(...correct) : 0;
}
