/** Light/dark preference. 'system' leaves it to prefers-color-scheme; an
 *  explicit choice stamps data-theme on <html> (see tokens.css guards). */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'mykurda_theme';

export function readTheme(): ThemePref {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  localStorage.setItem(KEY, pref);
}

/** Call once on boot to restore the saved choice before first paint. */
export function initTheme(): void {
  const pref = readTheme();
  if (pref !== 'system') document.documentElement.setAttribute('data-theme', pref);
}
