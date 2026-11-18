/** The tab registry, as plain data so it is testable without React Native. */
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/icon-paths';

export interface TabDef {
  /** Route name used by navigation and deep links. */
  name: TabName;
  /** The tab's name, looked up at render time so it follows the chosen language. */
  labelKey: TranslationKey;
  /** The glyph the bar draws. The Profile tab draws your picture instead, and uses this only before you are known. */
  icon: IconName;
  /** The same glyph drawn solid, for while you are on the tab. */
  activeIcon: IconName;
  /** Path segment for hevalo:// deep links. */
  path: string;
}

export type TabName = 'Home' | 'Learn' | 'Messages' | 'Profile';

/**
 * The four tabs: Home (the community wall, where you land), Learn (lessons, stories and games behind one switch),
 * Messages (conversations and friend requests) and Profile (you, with settings and the shop behind its menu). Search is
 * not a tab but the magnifier at the top of every tab; `legacyTabPath` keeps old links working.
 */
export const TABS: readonly TabDef[] = [
  { name: 'Home', labelKey: 'nav.home', icon: 'home', activeIcon: 'home-fill', path: 'home' },
  { name: 'Learn', labelKey: 'nav.learn', icon: 'book', activeIcon: 'book-fill', path: 'learn' },
  { name: 'Messages', labelKey: 'nav.messages', icon: 'send', activeIcon: 'send-fill', path: 'messages' },
  // Your picture is this tab; the glyph is only for before you are known.
  { name: 'Profile', labelKey: 'nav.profile', icon: 'person', activeIcon: 'person', path: 'profile' },
] as const;

/** Linking config: hevalo://learn opens the Learn tab, and so on. */
export function linkingScreens(): Record<TabName, string> {
  return Object.fromEntries(TABS.map((t) => [t.name, t.path])) as Record<TabName, string>;
}

/** The Learn tab's three views, in the switch's order. Stories sit between the two as reading first, a quiz after. */
export type LearnView = 'lessons' | 'stories' | 'games';

export const LEARN_VIEWS: readonly LearnView[] = ['lessons', 'stories', 'games'] as const;

export function isLearnView(v: unknown): v is LearnView {
  return v === 'lessons' || v === 'stories' || v === 'games';
}

/**
 * An address from an older layout, as the address it is now: links in old notifications, chats and emails still say
 * where things were. `hevalo://play` and `/app/games` open Learn's Games view, `hevalo://inbox` opens Messages, and the
 * battle's old `app/games/wordle-battle?id=…` opens the battle. The website's `/app/learn…` addresses are read too,
 * since story links are often copied from a browser, and its wall at `/app` opens Home with the same filter, its old
 * `/app/stories`, `/app/poems` and `/app/dimen` walls on their kinds.
 *
 * Games that became practice exercises open the exercise; retired games open Learn's games. Only the exact old
 * addresses are rewritten, with their query kept; App.tsx runs every incoming path through this.
 */
export function legacyTabPath(path: string): string {
  const [rawPath = '', query] = path.split('?', 2);
  const lead = rawPath.startsWith('/') ? '/' : '';
  const bare = rawPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const rest = query ? `&${query}` : '';
  const story = /^app\/learn\/stories\/([^/]+)$/.exec(bare);
  if (story) return `${lead}app/games/stories/${story[1]}${query ? `?${query}` : ''}`;
  // A game's invite link (shared join-link.ts) opens Join with a code on Games, the code filled in.
  const invite = /^join\/[a-z-]+\/([A-Za-z0-9]+)$/.exec(bare);
  if (invite) return `${lead}learn?view=games&code=${invite[1]!.toUpperCase()}`;
  switch (bare) {
    // The website's wall and its filter, and the walls it replaced.
    case 'app':
    case 'app/civak':
      return `${lead}home${query ? `?${query}` : ''}`;
    case 'app/stories':
      return `${lead}home?section=gotin&kind=cirok`;
    case 'app/poems':
      return `${lead}home?section=gotin&kind=helbest`;
    case 'app/dimen':
      return `${lead}home?section=dimen`;
    case 'app/learn':
      return `${lead}learn${query ? `?${query}` : ''}`;
    case 'app/learn/stories':
      return `${lead}learn?view=stories${rest}`;
    case 'play':
    case 'app/games':
    case 'app/play':
    case 'app/learn/games':
      return `${lead}learn?view=games${rest}`;
    // The lessons' two exercises, from when they were listed among the games.
    case 'app/games/build-sentence':
      return `${lead}app/learn/practice/build-sentence`;
    case 'app/games/hear-it':
      return `${lead}app/learn/practice/hear-it`;
    // Retired games: the room a link named is gone with them.
    case 'app/games/dont-say':
    case 'app/games/bluff':
    case 'app/games/village':
    case 'app/games/kingdom':
    case 'app/games/what-would-you-say':
      return `${lead}learn?view=games`;
    // The word game's lobby under its old name.
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
