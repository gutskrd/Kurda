import { describe, expect, it } from 'vitest';
import { STATE_LABEL, courseRows, flattenMap, flattenMaps, isLaunchable, stateHint, stateIcon } from './node';
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

describe('flattenMaps', () => {
  it('lists every course under its own title, not just the first', () => {
    const map = (id: string, title: string): CourseMap => ({
      course: { id, title },
      units: [{ unitId: `${id}-u`, title: 'Unit', skills: [node({ skillId: `${id}-s` })] }],
    });
    const rows = flattenMaps([map('a', 'Kurmanji for Beginners'), map('b', 'Newroz')]);
    expect(rows.map((r) => r.kind)).toEqual(['course', 'header', 'node', 'course', 'header', 'node']);
    expect(rows.filter((r) => r.kind === 'course').map((r) => (r as { title: string }).title)).toEqual([
      'Kurmanji for Beginners',
      'Newroz',
    ]);
  });
});

describe('courseRows', () => {
  const map = (id: string, title: string): CourseMap => ({
    course: { id, title },
    units: [{ unitId: `${id}-u`, title: 'Unit', skills: [node({ skillId: `${id}-s` })] }],
  });

  it('keeps a course whose map did not load, under its title, with a row that says so', () => {
    const rows = courseRows([
      { course: { id: 'a', title: 'Kurmanji for Beginners' }, map: map('a', 'Kurmanji for Beginners') },
      { course: { id: 'b', title: 'Newroz' }, map: null },
    ]);
    expect(rows.map((r) => r.kind)).toEqual(['course', 'header', 'node', 'course', 'failed']);
    expect(rows[3]).toMatchObject({ kind: 'course', title: 'Newroz' });
    expect(rows[4]).toEqual({ kind: 'failed', key: 'f:b', courseId: 'b' });
    // every key distinct, for the list
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
  });

  it('is flattenMaps when every map loaded', () => {
    const maps = [map('a', 'A'), map('b', 'B')];
    expect(courseRows(maps.map((m) => ({ course: m.course, map: m })))).toEqual(flattenMaps(maps));
  });

  it('says what failed for each course, and nothing for those that loaded', () => {
    const rows = courseRows([
      { course: { id: 'a', title: 'A' }, map: null },
      { course: { id: 'b', title: 'B' }, map: null },
    ]);
    expect(rows.map((r) => r.key)).toEqual(['c:a', 'f:a', 'c:b', 'f:b']);
    // the message is a real catalogue entry in every language
    for (const locale of LOCALES) expect(TRANSLATIONS[locale]['learn.mapFailed']).toBeTruthy();
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
