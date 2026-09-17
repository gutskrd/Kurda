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
 * The wall comes first, the way it does on the web.
 *
 * `/app` on the web is Civak; opening the phone on a different screen made
 * them feel like two products. Learn keeps its place directly after it.
 */
export const TABS: readonly TabDef[] = [
  { name: 'Civak', labelKey: 'nav.civak', icon: 'wall', path: 'civak' },
  { name: 'Learn', labelKey: 'nav.learn', icon: 'book', path: 'learn' },
  { name: 'Play', labelKey: 'nav.play', icon: 'play', path: 'play' },
  { name: 'Dictionary', labelKey: 'nav.dictionary', icon: 'text', path: 'dictionary' },
  { name: 'Social', labelKey: 'nav.friends', icon: 'people', path: 'social' },
  { name: 'Profile', labelKey: 'nav.profile', icon: 'person', path: 'profile' },
] as const;

/** react-navigation linking config: kurda://learn opens the Learn tab, etc. */
export function linkingScreens(): Record<string, string> {
  return Object.fromEntries(TABS.map((t) => [t.name, t.path]));
}
