import type { CourseMap } from '../coursemap/types';

/**
 * A lesson's own name, as its course's map lists it: what the lesson player
 * writes small above each question, so the learner knows which lesson they
 * are in ("Hamo at the blue gate"). A map from before the server listed a
 * skill's lessons names only the skill, which stands in for its first lesson.
 * Null when the map does not have the lesson at all.
 */
export function lessonTitle(map: CourseMap, lessonId: string): string | null {
  for (const unit of map.units) {
    for (const skill of unit.skills) {
      const lesson = skill.lessons?.find((l) => l.lessonId === lessonId);
      if (lesson) return lesson.title;
      if (!skill.lessons && skill.firstLessonId === lessonId) return skill.title;
    }
  }
  return null;
}
