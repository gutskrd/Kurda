import { describe, expect, it } from 'vitest';
import { TABS, linkingScreens } from './tabs';
import { LOCALES, TRANSLATIONS } from '../i18n/translations';

describe('tab registry', () => {
  it('has exactly the six product tabs, the wall first', () => {
    expect(TABS.map((t) => t.name)).toEqual(['Civak', 'Learn', 'Play', 'Dictionary', 'Social', 'Profile']);
  });

  it('has unique names and paths', () => {
    expect(new Set(TABS.map((t) => t.name)).size).toBe(TABS.length);
    expect(new Set(TABS.map((t) => t.path)).size).toBe(TABS.length);
  });

  /**
   * The labels are catalogue keys now, so this asserts on what a reader
   * actually sees rather than on a second copy of the words kept beside them.
   */
  it('labels every tab in Kurmanji with correct diacritics', () => {
    const ku = TABS.map((t) => TRANSLATIONS.ku[t.labelKey]);
    expect(ku).toContain('Fêrbûn');
    expect(ku).toContain('Lîstin');
    expect(ku).toContain('Profîl');
    for (const label of ku) expect(label.length).toBeGreaterThan(2);
  });

  it('gives no two tabs the same label, in any language', () => {
    for (const locale of LOCALES) {
      const labels = TABS.map((t) => TRANSLATIONS[locale][t.labelKey]);
      // Civak and the friends tab both read "Civak" in Kurmancî until the
      // friends tab stopped borrowing the word the wall needed
      expect(new Set(labels).size, locale).toBe(TABS.length);
    }
  });

  it('maps every tab to a deep-link path (kurda://<path>)', () => {
    const screens = linkingScreens();
    expect(screens['Learn']).toBe('learn');
    expect(screens['Dictionary']).toBe('dictionary');
    expect(Object.keys(screens)).toHaveLength(TABS.length);
  });
});
