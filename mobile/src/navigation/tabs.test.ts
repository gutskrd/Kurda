import { describe, expect, it } from 'vitest';
import { TABS, isLearnView, legacyTabPath, linkingScreens } from './tabs';
import { LOCALES, TRANSLATIONS } from '../i18n/translations';

describe('tab registry', () => {
  /*
   * The order is the design, so it is asserted whole rather than as a set:
   * reordering the list would move every tab under every thumb that has
   * learned where they are, and nothing else would notice.
   */
  it('has exactly the five, in order: Home, Learn, Messages, Search, Profile', () => {
    expect(TABS.map((t) => t.name)).toEqual(['Home', 'Learn', 'Messages', 'Search', 'Profile']);
  });

  it('draws a house, an open book, a paper plane, a magnifier and you', () => {
    expect(TABS.map((t) => t.icon)).toEqual(['home', 'book', 'send', 'search', 'person']);
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
    expect(ku).toEqual(['Mal', 'Fêrbûn', 'Peyam', 'Lêgerîn', 'Profîl']);
  });

  it('gives no two tabs the same label, in any language', () => {
    for (const locale of LOCALES) {
      const labels = TABS.map((t) => TRANSLATIONS[locale][t.labelKey]);
      expect(new Set(labels).size, locale).toBe(TABS.length);
    }
  });

  /*
   * Five tabs: a fifth of a 375pt phone is 75pt, room for a glyph and a
   * thumb. A sixth would make every tab narrower than a fingertip is wide.
   */
  it('has five tabs, each with a solid glyph for when it is the one you are on', () => {
    expect(TABS).toHaveLength(5);
    for (const tab of TABS) expect(tab.activeIcon).toBeTruthy();
  });

  it('maps every tab to a deep-link path (hevalo://<path>)', () => {
    expect(linkingScreens()).toEqual({ Home: 'home', Learn: 'learn', Messages: 'messages', Search: 'search', Profile: 'profile' });
  });
});

describe('old addresses', () => {
  it('opens Learn on its Games view for the old Play tab, on the phone and the website', () => {
    expect(legacyTabPath('play')).toBe('learn?view=games');
    expect(legacyTabPath('/play')).toBe('/learn?view=games');
    expect(legacyTabPath('/app/games')).toBe('/learn?view=games');
    expect(legacyTabPath('app/games/')).toBe('learn?view=games');
  });

  it('opens Messages for the old Inbox', () => {
    expect(legacyTabPath('inbox')).toBe('messages');
    expect(legacyTabPath('/inbox')).toBe('/messages');
  });

  it('opens a Peyvok Battle invite sent before the game was renamed', () => {
    expect(legacyTabPath('app/games/wordle-battle?id=abc123')).toBe('app/games/peyvok-battle?id=abc123');
    expect(legacyTabPath('/app/games/wordle-battle?id=abc123')).toBe('/app/games/peyvok-battle?id=abc123');
  });

  it('keeps a query the old address carried', () => {
    expect(legacyTabPath('play?from=push')).toBe('learn?view=games&from=push');
    expect(legacyTabPath('inbox?from=push')).toBe('messages?from=push');
  });

  /*
   * An invite is a game's address *under* /app/games, and it is the link that
   * somebody else sends, so it is the one that must never be swallowed by the
   * rewrite of the bare /app/games.
   */
  it('leaves a game invite, a lesson and the current tabs alone', () => {
    for (const path of ['app/games/peyvok-battle?id=abc123', '/app/games/stories', 'lesson/l1', 'learn', 'messages', 'home', 'playground']) {
      expect(legacyTabPath(path), path).toBe(path);
    }
  });

  it('knows the two halves of Learn and nothing else', () => {
    expect(isLearnView('lessons')).toBe(true);
    expect(isLearnView('games')).toBe(true);
    expect(isLearnView('play')).toBe(false);
    expect(isLearnView(undefined)).toBe(false);
  });
});
