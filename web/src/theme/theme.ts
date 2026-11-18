import { useEffect, useState } from 'react';

/**
 * Light or dark, chosen per browser rather than per account, since it is about the screen in use. Dark is the
 * default, matching the phone app.
 */
export type ThemePreference = 'dark' | 'light' | 'system';
type ColorScheme = 'dark' | 'light';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system'];
export const DEFAULT_THEME: ThemePreference = 'dark';

const KEY = 'hevalo_theme';
const SYSTEM_LIGHT = '(prefers-color-scheme: light)';

/** What this browser chose, or the default when it chose nothing (or cannot say). */
export function readThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** The scheme to draw: a choice wins; "system" follows the device, and dark where it will not say. */
export function resolveScheme(preference: ThemePreference, systemLight: boolean | null): ColorScheme {
  if (preference === 'system') return systemLight ? 'light' : 'dark';
  return preference;
}

function systemPrefersLight(): boolean | null {
  return globalThis.matchMedia ? globalThis.matchMedia(SYSTEM_LIGHT).matches : null;
}

/**
 * Puts the scheme on the root element, which every stylesheet colour keys off (styles/tokens.css), and sets
 * `theme-color` so a phone's address bar matches the page.
 */
export function applyTheme(preference: ThemePreference = readThemePreference()): ColorScheme {
  const scheme = resolveScheme(preference, systemPrefersLight());
  const root = document.documentElement;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = scheme === 'light' ? '#f6f4fd' : '#100e1d';
  return scheme;
}

const listeners = new Set<(p: ThemePreference) => void>();

/** Chooses, stores and applies a preference, and tells every mounted copy of the hook. */
export function setThemePreference(next: ThemePreference): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Site data is blocked; the choice still applies for this visit.
  }
  applyTheme(next);
  for (const listener of listeners) listener(next);
}

/** Follows the device's scheme without a reload while "system" is chosen. Called once at start-up. */
export function watchSystemTheme(): () => void {
  const mq = globalThis.matchMedia?.(SYSTEM_LIGHT);
  if (!mq) return () => undefined;
  const onChange = (): void => {
    if (readThemePreference() === 'system') applyTheme('system');
  };
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** The current choice, and a way to change it, for the Settings card. */
export function useThemePreference(): [ThemePreference, (next: ThemePreference) => void] {
  const [preference, setPreference] = useState<ThemePreference>(readThemePreference);
  useEffect(() => {
    listeners.add(setPreference);
    return () => {
      listeners.delete(setPreference);
    };
  }, []);
  return [preference, setThemePreference];
}
