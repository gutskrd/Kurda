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
 * A flattened map row for a list: a unit header or a skill node (Search
 * lists a course's skills this way).
 */
export type MapRow = { kind: 'header'; key: string; title: string } | { kind: 'node'; key: string; node: SkillNode };

/**
 * A course as the Learn tab has it: its map, or null when the map could not
 * be loaded — the course stays listed then, saying so, with a way to try again.
 */
export interface CourseEntry {
  course: { id: string; title: string };
  map: CourseMap | null;
}

/** Flatten units→skills into one list (unit headers interleaved). */
export function flattenMap(map: CourseMap): MapRow[] {
  const rows: MapRow[] = [];
  for (const unit of map.units) {
    rows.push({ kind: 'header', key: `u:${unit.unitId}`, title: unit.title });
    for (const node of unit.skills) rows.push({ kind: 'node', key: `s:${node.skillId}`, node });
  }
  return rows;
}
