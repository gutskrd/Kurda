/**
 * Adaptive placement logic (KUR-039). Pure — no DB, no content — so the
 * difficulty walk and placed-level rule are exhaustively unit-testable.
 *
 * "Level" is a skill's 1-based position within the course. The test walks
 * levels: harder (+1) on a correct answer, easier (−1) on a wrong one, and
 * stops after a fixed budget. The learner is placed at the highest level
 * they answered correctly — skills up to there are "tested out".
 */

import { createHash } from 'node:crypto';

export const PLACEMENT_MAX_QUESTIONS = 12;
export const PLACEMENT_START_LEVEL = 1;

export interface PlacementStep {
  level: number;
  correct: boolean;
  /** the exercise that was asked (absent on steps recorded before it was kept) */
  exerciseId?: string;
}

/**
 * Which of a level's candidate exercises to ask, for a seed.
 *
 * Placement used to ask the first exercise of every level, every time: the
 * same question to every learner, and the same question again when the walk
 * came back to a level — easy to learn by heart and pass without knowing the
 * skill. Now each question is drawn from all of the level's exercises, with a
 * seed of the session and the question number, so it is stable for one
 * attempt (resume asks the same thing) and differs between attempts.
 * Exercises this attempt has already asked are skipped while any other is
 * left. Returns an index into `candidates`, or -1 when there are none.
 */
export function pickCandidate(candidates: string[], seed: string, alreadyAsked: readonly string[] = []): number {
  if (candidates.length === 0) return -1;
  const fresh = candidates.map((_, i) => i).filter((i) => !alreadyAsked.includes(candidates[i]!));
  const pool = fresh.length > 0 ? fresh : candidates.map((_, i) => i);
  const draw = parseInt(createHash('sha1').update(seed).digest('hex').slice(0, 8), 16);
  return pool[draw % pool.length]!;
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
