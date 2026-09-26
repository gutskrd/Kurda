import { describe, expect, it } from 'vitest';
import { TABS, linkingScreens } from './tabs';
import { LOCALES, TRANSLATIONS } from '../i18n/translations';

describe('tab registry', () => {
  it('has exactly the five, home first and play in the middle', () => {
    expect(TABS.map((t) => t.name)).toEqual(['Home', 'Search', 'Play', 'Inbox', 'Profile']);
  });

  /*
   * Play is in the middle on purpose.
   *
   * It is the one of the five you open to do something rather than to look at
   * something, and the middle of a five-item bar is the slot a thumb finds
   * without aiming. Reordering the list would move it without anything
   * noticing, so the position is asserted rather than the membership alone.
   */
  it('puts play in the middle slot', () => {
    expect(TABS[Math.floor(TABS.length / 2)]?.name).toBe('Play');
  });

  it('has unique names and paths', () => {
    expect(new Set(TABS.map((t) => t.name)).size).toBe(TABS.length);
    expect(new Set(TABS.map((t) => t.path)).size).toBe(TABS.length);
  });

  /**
   * The labels are catalogue keys, so this asserts on what a reader actually
   * sees rather than on a second copy of the words kept beside them.
   */
  it('labels every tab in Kurmanji with correct diacritics', () => {
    const ku = TABS.map((t) => TRANSLATIONS.ku[t.labelKey]);
    expect(ku).toContain('Mal');
    expect(ku).toContain('Lêgerîn');
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

  /*
   * Four tabs, and none of them needs a short name.
   *
   * At six the island gave each tab 55.5 points at 375pt and two labels did
   * not fit in any language. At five it gives 66, and the longest of these
   * five is "Search" at 44 — which is why `shortLabelKey` is unused, and this
   * is the test that notices when a sixth is added and the labels start being
   * clipped again.
   */
  it('fits every label without a short form', () => {
    expect(TABS).toHaveLength(5);
    for (const tab of TABS) expect(tab.shortLabelKey).toBeUndefined();
  });

  /*
   * What a four-item bar is for.
   *
   * Home is where you land, Search is how you find anything, Play is what you
   * came to do, Inbox is what arrived, Profile is you. Everything else in the
   * app is reached from one of those five — and if a sixth ever looks
   * necessary, it is worth asking which of these it is really a part of.
   */
  it('keeps the bar to places rather than to tasks', () => {
    expect(TABS.map((t) => t.path)).toEqual(['home', 'search', 'play', 'inbox', 'profile']);
  });

  it('maps every tab to a deep-link path (kurda://<path>)', () => {
    const screens = linkingScreens();
    expect(screens['Home']).toBe('home');
    expect(screens['Search']).toBe('search');
    expect(Object.keys(screens)).toHaveLength(TABS.length);
  });
});
