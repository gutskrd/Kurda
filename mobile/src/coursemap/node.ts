import type { CourseMap, SkillNode, SkillState } from './types';
import type { TranslationKey } from '../i18n/translations';

/**
 * The state as a word, for the label a screen reader reads after the title.
 * Lowercase, because it is spoken after a comma — "Silav, girtî" — and a
 * TranslationKey rather than a string, so it cannot reach a screen unless
 * something calls t() on it.
 */
export const STATE_LABEL: Record<SkillState, TranslationKey> = {
  locked: 'coursemap.state.locked',
  unlocked: 'coursemap.state.unlocked',
  completed: 'coursemap.state.completed',
  gold: 'coursemap.state.gold',
  decayed: 'coursemap.state.decayed',
};
/**
 * A flattened map row for a virtualized list: a course title, a unit header, a
 * skill node — or, under a course whose map could not be loaded, a row that
 * says so.
 */
export type MapRow =
  | { kind: 'course'; key: string; title: string }
  | { kind: 'failed'; key: string; courseId: string }
  | { kind: 'header'; key: string; title: string }
  | { kind: 'node'; key: string; node: SkillNode };

/** A course as the Learn tab has it: its map, or null when the map could not be loaded. */
export interface CourseEntry {
  course: { id: string; title: string };
  map: CourseMap | null;
}

/** Flatten units→skills into one list (unit headers interleaved) for FlatList. */
export function flattenMap(map: CourseMap): MapRow[] {
  const rows: MapRow[] = [];
  for (const unit of map.units) {
    rows.push({ kind: 'header', key: `u:${unit.unitId}`, title: unit.title });
    for (const node of unit.skills) rows.push({ kind: 'node', key: `s:${node.skillId}`, node });
  }
  return rows;
}

/**
 * Every course's map in one list, each under its own title. The tab showed
 * only the first course the server listed, which hid every other one — the
 * Newroz course among them.
 */
export function flattenMaps(maps: CourseMap[]): MapRow[] {
  return courseRows(maps.map((map) => ({ course: map.course, map })));
}

/**
 * Every course the server lists, each under its own title — including one
 * whose map could not be loaded, which keeps its title and a row saying so
 * (with a way to try again) in place of its units. Leaving such a course out
 * hid it with nothing to say it was there: a learner with two courses saw one.
 */
export function courseRows(entries: CourseEntry[]): MapRow[] {
  return entries.flatMap(({ course, map }): MapRow[] => [
    { kind: 'course', key: `c:${course.id}`, title: map?.course.title ?? course.title },
    ...(map ? flattenMap(map) : [{ kind: 'failed' as const, key: `f:${course.id}`, courseId: course.id }]),
  ]);
}

/** A locked skill can't be started; everything else launches its lesson. */
export function isLaunchable(node: SkillNode): boolean {
  return node.state !== 'locked' && node.firstLessonId !== null;
}

/** Glyph shown on the node for each state. */
export function stateIcon(state: SkillState): string {
  switch (state) {
    case 'locked':
      return '🔒';
    case 'gold':
      return '⭐';
    case 'completed':
      return '✓';
    case 'decayed':
      return '⚠️';
    case 'unlocked':
      return '';
  }
}

/**
 * Why a node is in its state (locked/decayed nudges), as a catalogue key —
 * this module is pure, so the screen that has a translator looks it up.
 */
export function stateHint(state: SkillState): TranslationKey | null {
  switch (state) {
    case 'locked':
      return 'coursemap.locked';
    case 'decayed':
      return 'coursemap.rusty';
    default:
      return null;
  }
}
