import { useEffect, useState } from 'react';

/**
 * Light or dark, chosen on this device.
 *
 * Dark is what the app is before anybody chooses, as it is on the phone: it is
 * the look Hevalo has always had, and opening light on a light laptop would
 * make the same account look like a different product on two screens. Light,
 * and following the device, are there for anyone who wants them.
 *
 * The choice is kept in this browser rather than on the account. It is about
 * the screen in front of you — the same person may want light on a desk in
 * daylight and dark on a phone in bed — and the phone keeps its own the same
 * way.
 */
export type ThemePreference = 'dark' | 'light' | 'system';
export type ColorScheme = 'dark' | 'light';

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
 * Put the scheme on the page.
 *
 * One attribute on the root element, which every colour in the stylesheets is
 * keyed off (styles/tokens.css), and the browser's own `theme-color` so a
 * phone's address bar runs into the page instead of framing it in the other
 * colour.
 */
export function applyTheme(preference: ThemePreference = readThemePreference()): ColorScheme {
  const scheme = resolveScheme(preference, systemPrefersLight());
  const root = document.documentElement;
  root.dataset.theme = scheme;
  root.style.colorScheme = scheme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = scheme === 'light' ? '#f6f6f5' : '#0b0d10';
  return scheme;
}

const listeners = new Set<(p: ThemePreference) => void>();

/** Choose, remember and draw — every open copy of the hook hears about it. */
export function setThemePreference(next: ThemePreference): void {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // site data blocked: the choice still applies for this visit
  }
  applyTheme(next);
  for (const listener of listeners) listener(next);
}

/**
 * Follow the device while "system" is chosen.
 *
 * Called once at start-up. A laptop that turns dark at sunset should turn the
 * page with it, without a reload, for somebody who asked for exactly that.
 */
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
