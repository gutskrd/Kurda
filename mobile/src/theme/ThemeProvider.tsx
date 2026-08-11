import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { normalizePreference, resolveScheme, type ColorScheme, type ThemePreference } from './appearance';
import { PALETTES, type Palette } from './palette';
import { createThemeModeStore } from './themeModeStore';

const store = createThemeModeStore();

interface ThemeValue {
  scheme: ColorScheme;
  colors: Palette;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * App-wide light/dark theming (KUR-268). Resolves the persisted preference
 * against the OS scheme (via the tested appearance.ts logic) and exposes the
 * active glass palette. `system` tracks the OS live through `useColorScheme`.
 */
export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const os = useColorScheme();
  const systemScheme: ColorScheme | null = os === 'dark' || os === 'light' ? os : null;
  const [preference, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    let active = true;
    void store.get().then((p) => {
      if (active) setPref(normalizePreference(p));
    });
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    void store.set(p);
  }, []);

  const scheme = resolveScheme(preference, systemScheme);
  const value = useMemo<ThemeValue>(
    () => ({ scheme, colors: PALETTES[scheme], preference, setPreference }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
