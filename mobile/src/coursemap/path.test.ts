import { describe, expect, it } from 'vitest';
import { UNIT_TONES, lessonPath } from '@kurda/shared';
import { contrastRatio } from '../a11y/contrast';
import { interpolate } from '../i18n/format';
import { LOCALES, TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { PALETTES } from '../theme/palette';
import { REST, TONES, awayFrom, centredOffset, firstCourse, mix, stopLabel } from './path';
import type { CourseEntry } from './node';
import type { CourseMap, SkillNode } from './types';

const lesson = (id: string, completed = false) => ({ lessonId: id, position: 1, title: `Lesson ${id}`, completed });

const skill = (over: Partial<SkillNode> = {}): SkillNode => ({
  skillId: 's',
  level: 1,
  title: 'Silav',
  state: 'unlocked',
  strength: 0,
  hasGrammar: false,
  firstLessonId: 'l1',
  lessons: [lesson('l1'), lesson('l2')],
  ...over,
});

const map = (id: string, skills: SkillNode[]): CourseMap => ({ course: { id, title: `Course ${id}` }, units: [{ unitId: `${id}-u`, title: 'Basics', skills }] });

/** The words as an English reader hears them. */
function say(label: ReturnType<typeof stopLabel>): string {
  const en = TRANSLATIONS.en;
  return interpolate(en[label.words.key], { ...label.words.params, ...(label.state ? { state: en[label.state] } : {}) });
}

describe('unit colours', () => {
  it('has every tone the path hands out, in both schemes', () => {
    for (const scheme of ['dark', 'light'] as const) for (const tone of UNIT_TONES) expect(TONES[scheme][tone], `${scheme} ${tone}`).toBeDefined();
  });

  /*
   * A banner's words sit on its colour, a stop's glyph on its fill, and the
   * colour is read as words on the page itself (a sheet's eyebrow, "Start"
   * over the current skill). Each has to be readable in both schemes.
   */
  it('keeps every word on a unit’s colour, and the colour as words, readable (WCAG AA)', () => {
    for (const scheme of ['dark', 'light'] as const) {
      const page = PALETTES[scheme].background;
      const card = PALETTES[scheme].surfaceRaised;
      for (const tone of UNIT_TONES) {
        const c = TONES[scheme][tone];
        expect(contrastRatio(c.ink, c.fill), `${scheme} ${tone} ink on fill`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(c.text, card), `${scheme} ${tone} text on a sheet`).toBeGreaterThanOrEqual(4.5);
        // a finished stop stands out from the page as a shape
        expect(contrastRatio(c.fill, page), `${scheme} ${tone} fill on the page`).toBeGreaterThanOrEqual(3);
      }
      // the grey of a closed stop still shows its padlock
      expect(contrastRatio(REST[scheme].ink, REST[scheme].fill), `${scheme} rest`).toBeGreaterThanOrEqual(3);
    }
  });

  it('fades a colour toward another', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#7fcf9f', '#262a31', 0)).toBe('#7fcf9f');
    expect(mix('#7fcf9f', '#262a31', 1)).toBe('#262a31');
  });
});

describe('what a stop says', () => {
  it('names the skill, says where it stands, and counts its lessons', () => {
    const path = lessonPath(
      map('c', [
        skill({ skillId: 'a', title: 'Silav', state: 'gold', lessons: [lesson('1', true), lesson('2', true)] }),
        skill({ skillId: 'b', title: 'Malbat', lessons: [lesson('3', true), lesson('4'), lesson('5'), lesson('6')] }),
        skill({ skillId: 'c', title: 'Hejmar', state: 'locked', lessons: [lesson('7')] }),
      ]),
      { due: 4 },
    );
    const said = path.units[0]!.stops.map((p) => say(stopLabel(p.stop, 1)));
    expect(said).toEqual([
      'Silav, done, and strong, 2 of 2 lessons done',
      'Review, words ready: 4',
      'Malbat, you are here, 1 of 4 lessons done',
      'Hejmar, locked, 0 of 1 lessons done',
      'Unit 1 trophy, not earned yet',
    ]);
  });

  it('says a skill with no lessons yet without counting them', () => {
    const path = lessonPath(map('c', [skill({ lessons: [], state: 'decayed' })]));
    expect(say(stopLabel(path.units[0]!.stops[0]!.stop, 1))).toBe('Silav, done, ready for a refresh');
  });

  it('has every word of the path in all nine languages', () => {
    const keys = (Object.keys(TRANSLATIONS.en) as TranslationKey[]).filter((k) => k.startsWith('coursemap.path.'));
    expect(keys.length).toBeGreaterThan(30);
    for (const locale of LOCALES) {
      for (const key of keys) {
        const copy = TRANSLATIONS[locale][key];
        expect(copy, `${locale} ${key}`).toBeTruthy();
        // what fills a message in is the same in every language
        const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        expect(holes(copy), `${locale} ${key}`).toEqual(holes(TRANSLATIONS.en[key]));
      }
    }
  });
});

describe('which course the path opens on', () => {
  const entry = (m: CourseMap | null, id = m?.course.id ?? 'x'): CourseEntry => ({ course: { id, title: `Course ${id}` }, map: m });

  it('opens on a course already begun, over one not yet started', () => {
    const fresh = map('a', [skill()]);
    const begun = map('b', [skill({ skillId: 'b1', state: 'completed', lessons: [lesson('1', true)] }), skill({ skillId: 'b2' })]);
    expect(firstCourse([entry(fresh), entry(begun)])).toBe('b');
  });

  it('opens on the first with something to do, and never on one whose map failed', () => {
    const done = map('a', [skill({ state: 'completed', lessons: [lesson('1', true)] })]);
    const fresh = map('b', [skill()]);
    expect(firstCourse([entry(null, 'z'), entry(done), entry(fresh)])).toBe('b');
    expect(firstCourse([entry(null, 'z'), entry(done)])).toBe('a');
    // only a failed one: still listed, still shown, saying so
    expect(firstCourse([entry(null, 'z')])).toBe('z');
    expect(firstCourse([])).toBeNull();
  });
});

describe('finding the current skill on the screen', () => {
  it('scrolls a point to the middle of what the tab bar leaves', () => {
    expect(centredOffset(1200, 844, 100)).toBe(1200 - 372);
    // never above the top of the page
    expect(centredOffset(100, 844, 100)).toBe(0);
  });

  it('says which way the current skill went once it is well off the screen', () => {
    expect(awayFrom(500, 0, 844, 100)).toBeNull();
    expect(awayFrom(500, 520, 844, 100)).toBeNull();
    expect(awayFrom(500, 600, 844, 100)).toBe('up');
    expect(awayFrom(1000, 0, 844, 100)).toBe('down');
  });
});
