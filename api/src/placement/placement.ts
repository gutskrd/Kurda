/**
 * Pure adaptive placement logic. A level is a skill's 1-based position in the course. The test walks levels, up one
 * on a right answer and down one on a wrong, for a fixed budget, and places the learner at the highest level answered
 * right; skills up to there are tested out.
 */

import { createHash } from 'node:crypto';

export const PLACEMENT_MAX_QUESTIONS = 12;
export const PLACEMENT_START_LEVEL = 1;

export interface PlacementStep {
  level: number;
  correct: boolean;
  /** The exercise that was asked; absent on steps recorded before it was kept. */
  exerciseId?: string;
}

/**
 * Which of a level's candidate exercises to ask for a seed. Drawn from all the level's exercises with a seed of the
 * session and question number, so it is stable within an attempt (a resume asks the same) and differs between
 * attempts, making the test hard to learn by heart. Exercises already asked this attempt are skipped while others
 * remain. Returns an index into `candidates`, or -1 when there are none.
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
 * The test ends when the question budget is spent, or early once the walk has settled: two wrongs in a row at or
 * above the ceiling, so the learner cannot climb higher.
 */
export function isComplete(history: PlacementStep[], maxQuestions = PLACEMENT_MAX_QUESTIONS): boolean {
  if (history.length >= maxQuestions) return true;
  if (history.length >= 2) {
    const [a, b] = history.slice(-2);
    if (!a!.correct && !b!.correct && a!.level === 1 && b!.level === 1) return true; // bottomed out
  }
  return false;
}

/** The placed level: the highest level answered right, or 0. Skills up to it are tested out. */
export function placedLevel(history: PlacementStep[]): number {
  const correct = history.filter((s) => s.correct).map((s) => s.level);
  return correct.length ? Math.max(...correct) : 0;
}
