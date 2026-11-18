import { describe, expect, it } from 'vitest';
import { LEARN_VIEWS, TABS, isLearnView, legacyTabPath, linkingScreens } from './tabs';
import { LOCALES, TRANSLATIONS } from '../i18n/translations';

describe('tab registry', () => {
  /*
   * The order is the design, so it is asserted whole: reordering would move every tab under thumbs that learned where
   * they are.
   */
  it('has exactly the four, in order: Home, Learn, Messages, Profile', () => {
    expect(TABS.map((t) => t.name)).toEqual(['Home', 'Learn', 'Messages', 'Profile']);
  });

  it('draws a house, an open book, a paper plane and you', () => {
    expect(TABS.map((t) => t.icon)).toEqual(['home', 'book', 'send', 'person']);
  });

  it('has unique names and paths', () => {
    expect(new Set(TABS.map((t) => t.name)).size).toBe(TABS.length);
    expect(new Set(TABS.map((t) => t.path)).size).toBe(TABS.length);
  });

  /** The labels are catalogue keys, so this asserts on what a reader sees. */
  it('labels every tab in Kurmanji with correct diacritics', () => {
    const ku = TABS.map((t) => TRANSLATIONS.ku[t.labelKey]);
    expect(ku).toEqual(['Mal', 'Fêrbûn', 'Peyam', 'Profîl']);
  });

  it('gives no two tabs the same label, in any language', () => {
    for (const locale of LOCALES) {
      const labels = TABS.map((t) => TRANSLATIONS[locale][t.labelKey]);
      expect(new Set(labels).size, locale).toBe(TABS.length);
    }
  });

  /*
   * A quarter of the bar on a 320pt phone is over 70pt: room for a glyph, its word in the longest language, and a
   * thumb.
   */
  it('has four tabs, each with a solid glyph for when it is the one you are on', () => {
    expect(TABS).toHaveLength(4);
    for (const tab of TABS) expect(tab.activeIcon).toBeTruthy();
  });

  /* A tab's word has a quarter of the bar and one line: fourteen letters fit at the tab label's size. */
  it('names every tab in a word short enough to sit under its icon, in every language', () => {
    for (const locale of LOCALES) {
      for (const tab of TABS) expect(TRANSLATIONS[locale][tab.labelKey].length, `${locale} ${tab.name}`).toBeLessThanOrEqual(14);
    }
  });

  it('maps every tab to a deep-link path (hevalo://<path>)', () => {
    expect(linkingScreens()).toEqual({ Home: 'home', Learn: 'learn', Messages: 'messages', Profile: 'profile' });
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

  it('opens a Pêşbaziya Peyvan invite sent before the game was renamed', () => {
    expect(legacyTabPath('app/games/wordle-battle?id=abc123')).toBe('app/games/peyvok-battle?id=abc123');
    expect(legacyTabPath('/app/games/wordle-battle?id=abc123')).toBe('/app/games/peyvok-battle?id=abc123');
  });

  /* Links to the two games that became practice exercises, and to retired games, still open something. */
  it('opens the lessons’ two exercises from their old place among the games', () => {
    expect(legacyTabPath('app/games/build-sentence')).toBe('app/learn/practice/build-sentence');
    expect(legacyTabPath('/app/games/hear-it')).toBe('/app/learn/practice/hear-it');
    // And their own addresses are left alone.
    for (const path of ['app/learn/practice/build-sentence', '/app/learn/practice/hear-it']) expect(legacyTabPath(path), path).toBe(path);
  });

  it('opens Join with a code on Learn’s games for a game’s invite link, with the code filled in', () => {
    expect(legacyTabPath('join/impostor/KVXV5E?from=0b1e2d3c-4a5f-4c6d-8e7f-9a0b1c2d3e4f')).toBe('learn?view=games&code=KVXV5E');
    expect(legacyTabPath('/join/peyvok-battle/abc234')).toBe('/learn?view=games&code=ABC234');
    // Only the link's own shape: anything longer is left for the navigator to refuse.
    expect(legacyTabPath('join/impostor/KVXV5E/more')).toBe('join/impostor/KVXV5E/more');
  });

  it('opens Learn’s games for a link to a game that was retired, whatever room it named', () => {
    for (const path of ['app/games/dont-say?id=abc12345', '/app/games/bluff?id=abc12345', 'app/games/bluff', 'app/games/village', 'app/games/kingdom']) {
      expect(legacyTabPath(path), path).toBe(`${path.startsWith('/') ? '/' : ''}learn?view=games`);
    }
    // A game played alone had no room, only its own page.
    for (const path of ['app/games/what-would-you-say', '/app/games/what-would-you-say', 'app/games/what-would-you-say/']) {
      expect(legacyTabPath(path), path).toBe(`${path.startsWith('/') ? '/' : ''}learn?view=games`);
    }
  });

  it('opens the rankings for the website’s old league, ranks and season pages, and a game’s rank', () => {
    for (const path of ['app/leagues', 'app/ranks', 'app/season', 'app/ranks/wordle-battle', 'app/ranks/rhyme-match']) {
      expect(legacyTabPath(path), path).toBe('app/rankings');
    }
    expect(legacyTabPath('/app/leagues')).toBe('/app/rankings');
  });

  it('keeps a query the old address carried', () => {
    expect(legacyTabPath('play?from=push')).toBe('learn?view=games&from=push');
    expect(legacyTabPath('inbox?from=push')).toBe('messages?from=push');
  });

  /*
   * An invite is a game's address under /app/games and is sent by somebody else, so the rewrite of the bare /app/games
   * must never swallow it.
   */
  it('leaves a game invite, a lesson and the current tabs alone', () => {
    for (const path of ['app/games/peyvok-battle?id=abc123', '/app/games/stories', 'lesson/l1', 'learn', 'messages', 'home', 'playground']) {
      expect(legacyTabPath(path), path).toBe(path);
    }
  });

  /* The website's Learn addresses, as copied from a browser. */
  it('opens the website’s Learn addresses on the tab, its views and the reader', () => {
    expect(legacyTabPath('app/learn')).toBe('learn');
    expect(legacyTabPath('/app/learn/stories')).toBe('/learn?view=stories');
    expect(legacyTabPath('app/learn/stories?from=share')).toBe('learn?view=stories&from=share');
    expect(legacyTabPath('app/learn/games')).toBe('learn?view=games');
    expect(legacyTabPath('/app/learn/stories/nane-germ')).toBe('/app/games/stories/nane-germ');
  });

  it('opens Home for the website’s wall, keeping its filter, and its three old walls on their kinds', () => {
    expect(legacyTabPath('/app')).toBe('/home');
    expect(legacyTabPath('app?section=dimen&kind=mim')).toBe('home?section=dimen&kind=mim');
    expect(legacyTabPath('/app/civak?section=gotin')).toBe('/home?section=gotin');
    expect(legacyTabPath('app/stories')).toBe('home?section=gotin&kind=cirok');
    expect(legacyTabPath('/app/poems')).toBe('/home?section=gotin&kind=helbest');
    expect(legacyTabPath('app/dimen')).toBe('home?section=dimen');
    // A picture post keeps its own page.
    expect(legacyTabPath('app/dimen/p1')).toBe('app/dimen/p1');
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
