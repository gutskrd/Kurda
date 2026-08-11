/** Tab registry — pure data so it stays unit-testable without React Native. */

export interface TabDef {
  /** Route name used by navigation and deep links. */
  name: string;
  /** English label (used until full i18n in KUR-093). */
  title: string;
  /** Kurdish (Kurmanji) label. */
  titleKu: string;
  /** Skeuomorphic icon name (see theme/Icon). Kept as a plain string so this
   *  registry stays React-Native-free and unit-testable. */
  icon: 'home' | 'play' | 'book' | 'people' | 'person';
  /** Path segment for kurda:// deep links. */
  path: string;
}

export const TABS: readonly TabDef[] = [
  { name: 'Learn', title: 'Learn', titleKu: 'Fêrbûn', icon: 'home', path: 'learn' },
  { name: 'Play', title: 'Play', titleKu: 'Lîstik', icon: 'play', path: 'play' },
  { name: 'Dictionary', title: 'Dictionary', titleKu: 'Ferheng', icon: 'book', path: 'dictionary' },
  { name: 'Social', title: 'Social', titleKu: 'Civak', icon: 'people', path: 'social' },
  { name: 'Profile', title: 'Profile', titleKu: 'Profîl', icon: 'person', path: 'profile' },
] as const;

/** react-navigation linking config: kurda://learn opens the Learn tab, etc. */
export function linkingScreens(): Record<string, string> {
  return Object.fromEntries(TABS.map((t) => [t.name, t.path]));
}
