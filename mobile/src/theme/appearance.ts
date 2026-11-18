/**
 * Theme preference (`system` / `light` / `dark`) resolved to a colour scheme, plus Settings helpers. Pure, so the
 * decision is testable; the hook reading the OS scheme and the stored preference wrap it.
 */

import type { TranslationKey } from '../i18n/translations.js';

export type ColorScheme = 'light' | 'dark';
export type ThemePreference = 'system' | ColorScheme;

/** The default before anyone chooses: dark, matching hevalo.app, which has only a dark theme. Light and system remain in Appearance. */
export const DEFAULT_PREFERENCE: ThemePreference = 'dark';

/** The scheme `system` resolves to when the OS does not say. */
const DEFAULT_PREFERENCE_SCHEME: ColorScheme = 'dark';

/** The options, in the order the Appearance selector shows them. */
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Keys rather than words, so English labels cannot slip back into the UI. */
export const PREFERENCE_LABEL: Record<ThemePreference, TranslationKey> = {
  system: 'appearance.preference.system',
  light: 'appearance.preference.light',
  dark: 'appearance.preference.dark',
};

/** The scheme to render: an explicit preference wins; `system` follows the OS, or `DEFAULT_PREFERENCE_SCHEME` while the OS reports null. */
export function resolveScheme(
  preference: ThemePreference,
  systemScheme: ColorScheme | null,
): ColorScheme {
  if (preference === 'system') return systemScheme ?? DEFAULT_PREFERENCE_SCHEME;
  return preference;
}

/** Narrows a stored value back to a valid preference, else the default. */
export function normalizePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : DEFAULT_PREFERENCE;
}
