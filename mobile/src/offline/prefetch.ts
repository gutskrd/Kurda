import type { CourseMap } from '../coursemap/types';

/** How many upcoming lessons to pre-download (KUR-042). */
export const PREFETCH_COUNT = 5;

/**
 * The next lessons to pre-download from the course map: walk skills in order
 * and take each actionable (non-locked) skill's next lesson, up to `count`.
 * Locked skills are skipped — they can't be started yet. Pure.
 */
export function selectPrefetch(map: CourseMap, count = PREFETCH_COUNT): string[] {
  const ids: string[] = [];
  for (const unit of map.units) {
    for (const skill of unit.skills) {
      if (skill.state === 'locked' || skill.firstLessonId === null) continue;
      ids.push(skill.firstLessonId);
      if (ids.length >= count) return ids;
    }
  }
  return ids;
}

/** Extract audio URLs from a cached lesson session so they can be cached too. */
export function audioUrlsOf(exercises: Array<{ audioUrl?: string }>): string[] {
  return exercises.map((e) => e.audioUrl).filter((u): u is string => typeof u === 'string');
}
