import { describe, expect, it } from 'vitest';
import { LEARN_VIEWS, TABS, isLearnView, legacyTabPath, linkingScreens } from './tabs';
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

  /*
   * Two games became exercises of the lessons' practice and four were
   * retired. A link written while they were games still opens something: the
   * exercise where it is now, or the games there are.
   */
  it('opens the lessons’ two exercises from their old place among the games', () => {
    expect(legacyTabPath('app/games/build-sentence')).toBe('app/learn/practice/build-sentence');
    expect(legacyTabPath('/app/games/hear-it')).toBe('/app/learn/practice/hear-it');
    // and leaves their own addresses alone
    for (const path of ['app/learn/practice/build-sentence', '/app/learn/practice/hear-it']) expect(legacyTabPath(path), path).toBe(path);
  });

  it('opens Learn’s games for a game’s invite link, where the code is typed or pasted', () => {
    expect(legacyTabPath('join/impostor/KVXV5E?from=0b1e2d3c-4a5f-4c6d-8e7f-9a0b1c2d3e4f')).toBe('learn?view=games');
    expect(legacyTabPath('/join/peyvok-battle/ABC234')).toBe('/learn?view=games');
    // only the link's own shape: anything longer is left for the navigator to refuse
    expect(legacyTabPath('join/impostor/KVXV5E/more')).toBe('join/impostor/KVXV5E/more');
  });

  it('opens Learn’s games for a link to a game that was retired, whatever room it named', () => {
    for (const path of ['app/games/dont-say?id=abc12345', '/app/games/bluff?id=abc12345', 'app/games/bluff', 'app/games/village', 'app/games/kingdom']) {
      expect(legacyTabPath(path), path).toBe(`${path.startsWith('/') ? '/' : ''}learn?view=games`);
    }
    // a game played alone had no room, only its own page
    for (const path of ['app/games/what-would-you-say', '/app/games/what-would-you-say', 'app/games/what-would-you-say/']) {
      expect(legacyTabPath(path), path).toBe(`${path.startsWith('/') ? '/' : ''}learn?view=games`);
    }
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

  /*
   * The website's Learn addresses, as copied from a browser: the tab, its
   * Stories and Games views, and a story at the reader's own address. The
   * website's old /app/stories is the community wall, so it is not touched.
   */
  it('opens the website’s Learn addresses on the tab, its views and the reader', () => {
    expect(legacyTabPath('app/learn')).toBe('learn');
    expect(legacyTabPath('/app/learn/stories')).toBe('/learn?view=stories');
    expect(legacyTabPath('app/learn/stories?from=share')).toBe('learn?view=stories&from=share');
    expect(legacyTabPath('app/learn/games')).toBe('learn?view=games');
    expect(legacyTabPath('/app/learn/stories/nane-germ')).toBe('/app/games/stories/nane-germ');
    expect(legacyTabPath('app/stories?section=poems')).toBe('app/stories?section=poems');
  });

  it('knows the three groups of Learn, in order, and nothing else', () => {
    expect(LEARN_VIEWS).toEqual(['lessons', 'stories', 'games']);
    expect(isLearnView('lessons')).toBe(true);
    expect(isLearnView('stories')).toBe(true);
    expect(isLearnView('games')).toBe(true);
    expect(isLearnView('play')).toBe(false);
    expect(isLearnView(undefined)).toBe(false);
  });
});
