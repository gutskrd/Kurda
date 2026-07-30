import type { CourseMap, SkillNode, SkillState } from './types';

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

/** Short explanation for why a node is in its state (locked/decayed nudges). */
export function stateHint(state: SkillState): string | null {
  switch (state) {
    case 'locked':
      return 'Complete the previous skill to unlock this one.';
    case 'decayed':
      return 'This skill is getting rusty — practice to restore it.';
    default:
      return null;
  }
}
