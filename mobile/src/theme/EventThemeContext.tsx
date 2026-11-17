import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { onBackFromBackground } from '../net/backFromBackground';
import { resolveEventTheme, type ActiveEventLite, type EventThemePack } from './eventThemes.js';
import { getThemeOptOut, setThemeOptOut } from './themePref.js';

interface EventThemeValue {
  /** The pack to apply, or null (opted out / nothing live). */
  pack: EventThemePack | null;
  optedOut: boolean;
  setOptedOut: (value: boolean) => void;
  /** Re-resolve now (e.g. on a screen transition near the event boundary). */
  refresh: () => void;
}

const EventThemeContext = createContext<EventThemeValue>({
  pack: null,
  optedOut: false,
  setOptedOut: () => {},
  refresh: () => {},
});

/** How often to re-poll live events so the theme reverts near a boundary. */
const POLL_MS = 60_000;

/**
 * Tracks the active event theme app-wide (KUR-092). Live events are re-polled on
 * mount, when the app comes back from the background, and on a slow interval
 * while the app is not in the background, so the theme applies while an event
 * runs and reverts cleanly once it ends — there is no persisted theme state to
 * leave stale. Opt-out short-circuits to null.
 *
 * The interval stops in the background: a phone in a pocket shows no theme,
 * and an Android app left open behind another kept asking once a minute for
 * as long as the system let it run. Coming back asks at once and starts it
 * again; a Control Centre swipe, which never stopped it, asks nothing
 * (net/backFromBackground.ts).
 */
export function EventThemeProvider({ children }: { children: ReactNode }) {
  const { client, status } = useAuth();
  const [active, setActive] = useState<ActiveEventLite[]>([]);
  const [optedOut, setOptedOutState] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    void getThemeOptOut().then((v) => {
      if (mounted.current) setOptedOutState(v);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (status !== 'signedIn') {
      setActive([]);
      return;
    }
    void client.get<{ events: ActiveEventLite[] }>('/events/active').then((res) => {
      if (mounted.current && res.ok) setActive(res.data.events);
    });
  }, [client, status]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const stop = (): void => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    const start = (): void => {
      stop();
      interval = setInterval(refresh, POLL_MS);
    };
    refresh();
    if (AppState.currentState !== 'background') start();
    const away = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'background') stop();
    });
    const stopListening = onBackFromBackground(AppState, () => {
      refresh();
      start();
    });
    return () => {
      stop();
      // react-native-web hands back nothing where the page cannot say whether it is visible
      away?.remove();
      stopListening();
    };
  }, [refresh]);

  const setOptedOut = useCallback((value: boolean) => {
    setOptedOutState(value);
    void setThemeOptOut(value);
  }, []);

  const pack = resolveEventTheme(active, optedOut);

  return (
    <EventThemeContext.Provider value={{ pack, optedOut, setOptedOut, refresh }}>
      {children}
    </EventThemeContext.Provider>
  );
}

export function useEventTheme(): EventThemeValue {
  return useContext(EventThemeContext);
}
