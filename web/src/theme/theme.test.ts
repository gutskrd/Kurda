import { describe, it, expect, afterEach, vi } from 'vitest';
import { applyTheme, readThemePreference, resolveScheme, setThemePreference, DEFAULT_THEME } from './theme';

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

/** A device that says it prefers light, or dark. */
function deviceLight(light: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('light') ? light : !light,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe('the colour scheme', () => {
  it('is dark until somebody chooses otherwise, even on a light device', () => {
    deviceLight(true);
    expect(DEFAULT_THEME).toBe('dark');
    expect(readThemePreference()).toBe('dark');
    expect(applyTheme()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows the device only when asked to', () => {
    expect(resolveScheme('system', true)).toBe('light');
    expect(resolveScheme('system', false)).toBe('dark');
    // a device that will not say is treated as dark, the app's own look
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('light', false)).toBe('light');
  });

  it('remembers the choice on this device and puts it on the page at once', () => {
    deviceLight(false);
    setThemePreference('light');
    expect(localStorage.getItem('hevalo_theme')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(readThemePreference()).toBe('light');
  });

  it('ignores a stored value it does not know', () => {
    localStorage.setItem('hevalo_theme', 'sepia');
    expect(readThemePreference()).toBe('dark');
  });
});
