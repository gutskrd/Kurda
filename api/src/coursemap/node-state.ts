/**
 * Course-map node state, pure so the rules are unit-testable:
 *
 *   locked    — previous skill not done and not tested out
 *   unlocked  — available, not finished
 *   completed — every published lesson done, strength healthy
 *   gold      — completed and very strong
 *   decayed   — completed but strength has slipped (cracked ring, practice)
 */

export type SkillState = 'locked' | 'unlocked' | 'completed' | 'gold' | 'decayed';

/** Strength at/above this is "gold". */
export const GOLD_STRENGTH = 80;
/** A completed skill whose strength drops below this is "decayed". */
export const DECAY_STRENGTH = 40;

export interface SkillProgress {
  unlocked: boolean;
  completed: boolean;
  /** 0–100 */
  strength: number;
}

export function skillState({ unlocked, completed, strength }: SkillProgress): SkillState {
  if (!unlocked) return 'locked';
  if (!completed) return 'unlocked';
  if (strength >= GOLD_STRENGTH) return 'gold';
  if (strength < DECAY_STRENGTH) return 'decayed';
  return 'completed';
}

/** A skill is unlocked when it is the first, its predecessor is completed, or the learner tested out through its level. */
export function isUnlocked(level: number, previousCompleted: boolean, unlockedThrough: number): boolean {
  return level === 1 || previousCompleted || level <= unlockedThrough;
}
