/** Tab registry — pure data so it stays unit-testable without React Native. */
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/icon-paths';

export interface TabDef {
  /** Route name used by navigation and deep links. */
  name: TabName;
  /**
   * What the bar says, looked up at render time so it follows the chosen
   * language. The labels used to be a hardcoded English `title` with an
   * unused `titleKu` beside it — five tabs that stayed English in an app
   * read in eight languages, while every screen behind them translated.
   */
  labelKey: TranslationKey;
  /**
   * A shorter name, for a tab whose screen is called something long.
   *
   * Nothing uses it at five tabs — each gets about 66 points of the island
   * and every label fits. It earned its place at six, where "Community"
   * needed 58 points of the 55 it had and arrived as "Communi…", and it
   * stays because the next tab added is the one that needs it.
   */
  shortLabelKey?: TranslationKey;
  /**
   * Which glyph the bar draws (see theme/Icon). The Profile tab draws your
   * own picture instead, and keeps a glyph only for before you are known.
   */
  icon: IconName;
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
 *   Learn is lessons and games together, behind one switch at its top. They
 *   were two places (the lessons a screen pushed from the top of Play), and
 *   continuing a lesson took two taps and a decision; it is one tap now, and a
 *   game is two from anywhere.
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
  { name: 'Home', labelKey: 'nav.home', icon: 'home', path: 'home' },
  { name: 'Learn', labelKey: 'nav.learn', icon: 'book', path: 'learn' },
  { name: 'Messages', labelKey: 'nav.messages', icon: 'send', path: 'messages' },
  { name: 'Search', labelKey: 'nav.search', icon: 'search', path: 'search' },
  { name: 'Profile', labelKey: 'nav.profile', icon: 'person', path: 'profile' },
] as const;

/** react-navigation linking config: hevalo://learn opens the Learn tab, etc. */
export function linkingScreens(): Record<TabName, string> {
  return Object.fromEntries(TABS.map((t) => [t.name, t.path])) as Record<TabName, string>;
}

/** The two halves of the Learn tab. */
export type LearnView = 'lessons' | 'games';

export function isLearnView(v: unknown): v is LearnView {
  return v === 'lessons' || v === 'games';
}

/**
 * An address from before the tabs changed, as the address it is now.
 *
 * Links outlive layouts: a notification sent last month, a link pasted into
 * a chat, an invite in somebody's email all say where things *were*. So
 * `hevalo://play` (and the website's `/app/games`) open Learn on its Games
 * view, and `hevalo://inbox` opens Messages. Everything else — a lesson, a
 * game's invite at `app/games/<game>?id=…` — is passed through untouched;
 * only the exact old tab addresses are rewritten, with their query kept.
 *
 * Pure, so the rewriting is tested without a navigator; App.tsx runs every
 * incoming path through it before React Navigation reads it.
 */
export function legacyTabPath(path: string): string {
  const [rawPath = '', query] = path.split('?', 2);
  const lead = rawPath.startsWith('/') ? '/' : '';
  const bare = rawPath.replace(/^\/+/, '').replace(/\/+$/, '');
  const rest = query ? `&${query}` : '';
  switch (bare) {
    case 'play':
    case 'app/games':
    case 'app/play':
      return `${lead}learn?view=games${rest}`;
    case 'inbox':
    case 'app/inbox':
    case 'chats':
    case 'app/messages':
      return `${lead}messages${query ? `?${query}` : ''}`;
    default:
      return path;
  }
}
