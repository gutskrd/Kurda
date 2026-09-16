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
/** A flattened map row for a virtualized list: a unit header or a skill node. */
export type MapRow =
  | { kind: 'header'; key: string; title: string }
  | { kind: 'node'; key: string; node: SkillNode };

/** Flatten units→skills into one list (unit headers interleaved) for FlatList. */
export function flattenMap(map: CourseMap): MapRow[] {
  const rows: MapRow[] = [];
  for (const unit of map.units) {
    rows.push({ kind: 'header', key: `u:${unit.unitId}`, title: unit.title });
    for (const node of unit.skills) rows.push({ kind: 'node', key: `s:${node.skillId}`, node });
  }
  return rows;
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
