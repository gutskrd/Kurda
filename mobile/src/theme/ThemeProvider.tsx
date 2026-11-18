import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { DEFAULT_PREFERENCE, normalizePreference, resolveScheme, type ColorScheme, type ThemePreference } from './appearance';
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
 * App-wide light and dark theming: resolves the stored preference against the OS scheme (appearance.ts) and provides
 * the active palette; `system` tracks the OS live.
 */
export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const os = useColorScheme();
  const systemScheme: ColorScheme | null = os === 'dark' || os === 'light' ? os : null;
  const [preference, setPref] = useState<ThemePreference>(DEFAULT_PREFERENCE);

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

/** Draws its children with the dark palette whatever the app's scheme, for a moment staged on its own dark backdrop (a legendary gift's unwrap). */
export function DarkScheme({ children }: { children: ReactNode }): React.JSX.Element {
  const outer = useTheme();
  const value = useMemo<ThemeValue>(() => ({ ...outer, scheme: 'dark', colors: PALETTES.dark }), [outer]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Draws its children in a palette of their own, in the app's current scheme: a place with its own look (a lesson's
 * warm paper), so anything the app draws inside it, from a sheet to a button, uses that place's colours.
 */
export function PaletteScope({ palettes, children }: { palettes: Record<ColorScheme, Palette>; children: ReactNode }): React.JSX.Element {
  const outer = useTheme();
  const value = useMemo<ThemeValue>(() => ({ ...outer, colors: palettes[outer.scheme] }), [outer, palettes]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
