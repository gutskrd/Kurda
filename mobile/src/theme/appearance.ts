/**
 * Appearance / Dark-Light mode resolution (KUR-268). Pure logic for the theme
 * preference (`system` / `light` / `dark`) → effective colour scheme, plus the
 * Settings selector helpers. The React hook that reads the OS scheme
 * (Appearance API) and the persisted preference are thin wrappers over this;
 * keeping the decision here makes it deterministically testable.
 */

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'system' | ColorScheme;

/** Selectable options, in the order the Settings selector shows them. */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

export const PREFERENCE_LABEL: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * The scheme to actually render: an explicit preference wins; `system` follows
 * the OS. When the OS scheme is unknown (null — some platforms report null
 * before the first read), default to light.
 */
export function resolveScheme(
  preference: ThemePreference,
  systemScheme: ColorScheme | null,
): ColorScheme {
  if (preference === 'system') return systemScheme ?? 'light';
  return preference;
}

/** Convenience: is the effective scheme dark? */
export function isDarkMode(preference: ThemePreference, systemScheme: ColorScheme | null): boolean {
  return resolveScheme(preference, systemScheme) === 'dark';
}

/** Cycle through System → Light → Dark → System (e.g. a tap-to-toggle control). */
export function nextPreference(preference: ThemePreference): ThemePreference {
  const i = THEME_PREFERENCES.indexOf(preference);
  return THEME_PREFERENCES[(i + 1) % THEME_PREFERENCES.length] ?? 'system';
}

/** Narrow an arbitrary stored value back to a valid preference (default system). */
export function normalizePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}
