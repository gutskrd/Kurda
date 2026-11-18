import type { CourseMap } from '../coursemap/types';

/**
 * A lesson's name as its course map lists it, shown small above each question ("Hamo at the blue gate"). An older
 * map lists only skills, so a skill's name stands in for its first lesson. Null when the map lacks the lesson.
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
