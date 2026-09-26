/** Tab registry — pure data so it stays unit-testable without React Native. */
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/icon-paths';

export interface TabDef {
  /** Route name used by navigation and deep links. */
  name: string;
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
   * Nothing uses it at five tabs — each gets 66 points of the island and
   * every label fits. It earned its place at six, where "Community" needed
   * 58 points of the 55 it had and arrived as "Communi…", and it stays
   * because the next tab added is the one that needs it.
   */
  shortLabelKey?: TranslationKey;
  /**
   * Which glyph the bar draws (see theme/Icon).
   *
   * These match the browser's nav one destination at a time: Civak is the
   * newspaper it is there, Learn the open book, the dictionary the letters.
   * The phone had a globe for Civak and a house for Learn, which made the two
   * navs read as two products.
   */
  icon: IconName;
  /** Path segment for kurda:// deep links. */
  path: string;
}

/**
 * Five, and none of them needs a short name to fit.
 *
 * There were six, and six is more than a bar can label at 375pt — it is why
 * two of them carried a `shortLabelKey`, and why "Community" arrived as
 * "Civak" and "Dictionary" as "Dictio…". Five is not six: the island gives
 * each tab 66 points rather than 55, and the longest of these five is
 * "Search" at 44.
 *
 * What left, and where it went:
 *
 *   Civak is Home. Same screen, a house on it, because it is the first
 *   thing you land on and that is what a house means.
 *
 *   Learn and Dictionary are at the top of Play. They were behind a
 *   floating button for a while; a tap on a button that opens a menu that
 *   opens a screen is two taps and a decision, and the middle of the bar
 *   is one tap and the easiest place on it to hit.
 *
 *   Friends is gone as a place. You found people by searching and heard
 *   from them in requests and messages, and those are now Search and Inbox
 *   — so the tab was a door to two rooms that both have their own.
 *
 * Play sits in the middle on purpose. It is the one of the five you open
 * to do something rather than to look at something, and the middle of a
 * five-item bar is the slot a thumb finds without aiming.
 */
export const TABS: readonly TabDef[] = [
  { name: 'Home', labelKey: 'nav.home', icon: 'home', path: 'home' },
  { name: 'Search', labelKey: 'nav.search', icon: 'search', path: 'search' },
  { name: 'Play', labelKey: 'nav.play', icon: 'play', path: 'play' },
  { name: 'Inbox', labelKey: 'nav.inbox', icon: 'tray', path: 'inbox' },
  { name: 'Profile', labelKey: 'nav.profile', icon: 'person', path: 'profile' },
] as const;

/** react-navigation linking config: kurda://learn opens the Learn tab, etc. */
export function linkingScreens(): Record<string, string> {
  return Object.fromEntries(TABS.map((t) => [t.name, t.path]));
}
