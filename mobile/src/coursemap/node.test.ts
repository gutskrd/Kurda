import { describe, expect, it } from 'vitest';
import { STATE_LABEL, flattenMap, isLaunchable, stateHint, stateIcon } from './node';
import type { CourseMap, SkillNode, SkillState } from './types';
import { TRANSLATIONS, LOCALES } from '../i18n/translations';

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
    expect(stateHint('locked')).toBe('coursemap.locked');
    expect(stateHint('decayed')).toBe('coursemap.rusty');
    expect(stateHint('gold')).toBeNull();
    // a key with nothing behind it renders as itself, which the type allows
    for (const state of ['locked', 'decayed'] as const) {
      const key = stateHint(state)!;
      for (const loc of LOCALES) expect(TRANSLATIONS[loc][key], `${loc} ${key}`).toBeTruthy();
    }
  });
});

describe('STATE_LABEL', () => {
  /**
   * The node used to announce its raw state to a screen reader — "Silav,
   * locked" — because the label was a template literal holding the enum.
   * Every state now has a word, and every language has to have it.
   */
  it('gives every skill state a word in all nine languages', () => {
    const states: SkillState[] = ['locked', 'unlocked', 'completed', 'gold', 'decayed'];
    for (const state of states) {
      const key = STATE_LABEL[state];
      for (const loc of LOCALES) {
        const copy = TRANSLATIONS[loc][key];
        expect(copy, loc + ' ' + state).toBeTruthy();
        expect(copy, loc + ' ' + state + ' reads as its own key').not.toBe(key);
      }
    }
  });
});
