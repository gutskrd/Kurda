/** Tab registry — pure data so it stays unit-testable without React Native. */

export interface TabDef {
  /** Route name used by navigation and deep links. */
  name: string;
  /** English label (used until full i18n in KUR-093). */
  title: string;
  /** Kurdish (Kurmanji) label. */
  titleKu: string;
  /** Placeholder icon until the icon set lands with the design pass. */
  emoji: string;
  /** Path segment for kurda:// deep links. */
  path: string;
}

export const TABS: readonly TabDef[] = [
  { name: 'Learn', title: 'Learn', titleKu: 'Fêrbûn', emoji: '📚', path: 'learn' },
  { name: 'Play', title: 'Play', titleKu: 'Lîstik', emoji: '🎮', path: 'play' },
  { name: 'Dictionary', title: 'Dictionary', titleKu: 'Ferheng', emoji: '📖', path: 'dictionary' },
  { name: 'Social', title: 'Social', titleKu: 'Civak', emoji: '👥', path: 'social' },
  { name: 'Profile', title: 'Profile', titleKu: 'Profîl', emoji: '🧑', path: 'profile' },
] as const;

/** react-navigation linking config: kurda://learn opens the Learn tab, etc. */
export function linkingScreens(): Record<string, string> {
  return Object.fromEntries(TABS.map((t) => [t.name, t.path]));
}
