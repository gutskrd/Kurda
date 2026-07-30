import { describe, expect, it } from 'vitest';
import { flattenMap, isLaunchable, stateHint, stateIcon } from './node';
import type { CourseMap, SkillNode } from './types';

const node = (over: Partial<SkillNode> = {}): SkillNode => ({
  skillId: 's1', level: 1, title: 'Skill', state: 'unlocked', strength: 50, hasGrammar: false, firstLessonId: 'l1', ...over,
});

describe('flattenMap', () => {
  it('interleaves unit headers with their skill nodes', () => {
    const map: CourseMap = {
      course: { id: 'c', title: 'C' },
      units: [
        { unitId: 'u1', title: 'Unit 1', skills: [node({ skillId: 'a' }), node({ skillId: 'b' })] },
        { unitId: 'u2', title: 'Unit 2', skills: [node({ skillId: 'c' })] },
      ],
    };
    const rows = flattenMap(map);
    expect(rows.map((r) => r.kind)).toEqual(['header', 'node', 'node', 'header', 'node']);
    expect(rows[0]).toMatchObject({ kind: 'header', title: 'Unit 1' });
  });
});

describe('isLaunchable', () => {
  it('is false for locked or lesson-less nodes', () => {
    expect(isLaunchable(node({ state: 'locked' }))).toBe(false);
    expect(isLaunchable(node({ firstLessonId: null }))).toBe(false);
  });
  it('is true for a startable skill', () => {
    expect(isLaunchable(node({ state: 'unlocked' }))).toBe(true);
    expect(isLaunchable(node({ state: 'decayed' }))).toBe(true);
  });
});

describe('stateIcon / stateHint', () => {
  it('maps each state to a glyph', () => {
    expect(stateIcon('locked')).toBe('🔒');
    expect(stateIcon('gold')).toBe('⭐');
    expect(stateIcon('unlocked')).toBe('');
  });
  it('hints only for locked and decayed', () => {
    expect(stateHint('locked')).toMatch(/unlock/i);
    expect(stateHint('decayed')).toMatch(/practice/i);
    expect(stateHint('gold')).toBeNull();
  });
});
