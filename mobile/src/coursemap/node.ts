import type { CourseMap, SkillNode, SkillState } from './types';
import type { TranslationKey } from '../i18n/translations';

/**
 * A skill's state, read after its title ("Silav, girtî"), hence lowercase. A key rather than a string so it is
 * always translated.
 */
export const STATE_LABEL: Record<SkillState, TranslationKey> = {
  locked: 'coursemap.state.locked',
  unlocked: 'coursemap.state.unlocked',
  completed: 'coursemap.state.completed',
  gold: 'coursemap.state.gold',
  decayed: 'coursemap.state.decayed',
};

/** A unit header or skill row of a flattened map, as Search lists a course. */
type MapRow = { kind: 'header'; key: string; title: string } | { kind: 'node'; key: string; node: SkillNode };

/** A course as the Learn tab holds it; `map` is null when it failed to load, and the course offers a retry. */
export interface CourseEntry {
  /** As `/courses` lists it: 'kurmanji' or 'sorani'. */
  course: { id: string; title: string; dialect?: string };
  map: CourseMap | null;
}

/** Flattens units and skills into one list, with unit headers between. */
export function flattenMap(map: CourseMap): MapRow[] {
  const rows: MapRow[] = [];
  for (const unit of map.units) {
    rows.push({ kind: 'header', key: `u:${unit.unitId}`, title: unit.title });
    for (const node of unit.skills) rows.push({ kind: 'node', key: `s:${node.skillId}`, node });
  }
  return rows;
}
