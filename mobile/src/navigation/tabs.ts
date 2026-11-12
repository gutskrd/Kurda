/** Tab registry — pure data so it stays unit-testable without React Native. */
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/icon-paths';

export interface TabDef {
  /** Route name used by navigation and deep links. */
  name: TabName;
  /**
   * The tab's name, looked up at render time so it follows the chosen
   * language: what a screen reader says for the tab, and what shows above it
   * while it is held. The bar itself draws only the icons.
   */
  labelKey: TranslationKey;
  /**
   * Which glyph the bar draws (see theme/Icon). The Profile tab draws your
   * own picture instead, and keeps a glyph only for before you are known.
   */
  icon: IconName;
  /** The same glyph drawn solid, for while you are on the tab. */
  activeIcon: IconName;
  /** Path segment for hevalo:// deep links. */
  path: string;
}

export type TabName = 'Home' | 'Learn' | 'Messages' | 'Search' | 'Profile';

/**
 * Five places, in the order a day with the app tends to go.
 *
 *   Home is the community's wall — what everyone wrote and pictured — and is
 *   where you land.
 *
 *   Learn is lessons, stories and games together, behind one switch at its
 *   top. Lessons and games were two places (the lessons a screen pushed from
 *   the top of Play), and continuing a lesson took two taps and a decision;
 *   it is one tap now, a story to read is two, and a game is two from
 *   anywhere.
 *
 *   Messages is conversations — with one person or with a group — and the
 *   friend requests waiting on you, at the top where they cannot sink.
 *
 *   Search finds people, words, lessons and games, and with nothing typed it
 *   shows what you looked for before and people you may know.
 *
 *   Profile is you: your picture is the tab, and settings, the shop and what
 *   you saved are behind its menu.
 *
 * What left: Play is Learn's Games view, and the old Inbox split in two — its
 * conversations and requests are Messages, its notifications are the bell at
 * the top of Home. `legacyTabPath` keeps the old links working.
 */
export const TABS: readonly TabDef[] = [
  { name: 'Home', labelKey: 'nav.home', icon: 'home', activeIcon: 'home-fill', path: 'home' },
  { name: 'Learn', labelKey: 'nav.learn', icon: 'book', activeIcon: 'book-fill', path: 'learn' },
  { name: 'Messages', labelKey: 'nav.messages', icon: 'send', activeIcon: 'send-fill', path: 'messages' },
  { name: 'Search', labelKey: 'nav.search', icon: 'search', activeIcon: 'search-bold', path: 'search' },
  // your picture is this tab; the glyph is only for before you are known
  { name: 'Profile', labelKey: 'nav.profile', icon: 'person', activeIcon: 'person', path: 'profile' },
] as const;

/** react-navigation linking config: hevalo://learn opens the Learn tab, etc. */
export function linkingScreens(): Record<TabName, string> {
  return Object.fromEntries(TABS.map((t) => [t.name, t.path])) as Record<TabName, string>;
}

/**
 * The three groups of the Learn tab, in the order the switch shows them:
 * the lessons, the stories to read, and the games. Stories sit between the
 * two because that is what they are — reading first, a quiz after.
 */
export type LearnView = 'lessons' | 'stories' | 'games';

export const LEARN_VIEWS: readonly LearnView[] = ['lessons', 'stories', 'games'] as const;

export function isLearnView(v: unknown): v is LearnView {
  return v === 'lessons' || v === 'stories' || v === 'games';
}

/**
 * An address from before the tabs changed, as the address it is now.
 *
 * Links outlive layouts: a notification sent last month, a link pasted into
 * a chat, an invite in somebody's email all say where things *were*. So
 * `hevalo://play` (and the website's `/app/games`) open Learn on its Games
 * view, `hevalo://inbox` opens Messages, and a Peyvok Battle invite at its
 * old `app/games/wordle-battle?id=…` opens the battle. Everything else — a
 * lesson, any other game's invite — is passed through untouched; only the
 * exact old addresses are rewritten, with their query kept.
 *
 * The website's Learn addresses are read here too, since a link to a story
 * is copied from a browser as often as from the app: `/app/learn` is the
 * Learn tab, `/app/learn/stories` its Stories view, `/app/learn/games` its
 * Games view, and `/app/learn/stories/<slug>` the story itself, at the
 * reader's own address. `/app/stories` is left alone: on the website that is
 * the community wall's old address, not the library's.
 *
 * Two games became exercises of the lessons' practice, and three were
 * retired. A link to Build a Kurdish Sentence or Hear It, Find It at its old
 * place among the games opens the exercise where it is now; a link to Don't
 * Say the Word!, Kurdish Bluff or The Village, whatever room it named, opens
 * Learn's games, where what can be played is.
 *
 * Pure, so the rewriting is tested without a navigator; App.tsx runs every
 * incoming path through it before React Navigation reads it.
 */
export function legacyTabPath(path: string): string {
  const [rawPath = '', query] = path.split('?', 2);
  const lead = rawPath.startsWith('/') ? '/' : '';
  const bare = rawPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const rest = query ? `&${query}` : '';
  const story = /^app\/learn\/stories\/([^/]+)$/.exec(bare);
  if (story) return `${lead}app/games/stories/${story[1]}${query ? `?${query}` : ''}`;
  switch (bare) {
    case 'app/learn':
      return `${lead}learn${query ? `?${query}` : ''}`;
    case 'app/learn/stories':
      return `${lead}learn?view=stories${rest}`;
    case 'play':
    case 'app/games':
    case 'app/play':
    case 'app/learn/games':
      return `${lead}learn?view=games${rest}`;
    // the lessons' two exercises, from when they were listed among the games
    case 'app/games/build-sentence':
      return `${lead}app/learn/practice/build-sentence`;
    case 'app/games/hear-it':
      return `${lead}app/learn/practice/hear-it`;
    // games Hevalo no longer has: the room a link named is gone with them
    case 'app/games/dont-say':
    case 'app/games/bluff':
    case 'app/games/village':
    case 'app/games/kingdom':
      return `${lead}learn?view=games`;
    // the word game's lobby, from before the game was renamed
    case 'app/games/wordle-battle':
      return `${lead}app/games/peyvok-battle${query ? `?${query}` : ''}`;
    case 'inbox':
    case 'app/inbox':
    case 'chats':
    case 'app/messages':
      return `${lead}messages${query ? `?${query}` : ''}`;
    default:
      return path;
  }
}
