import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { onBackFromBackground } from '../net/backFromBackground';
import { resolveEventTheme, type ActiveEventLite, type EventThemePack } from './eventThemes.js';
import { getThemeOptOut, setThemeOptOut } from './themePref.js';

interface EventThemeValue {
  /** The pack to apply, or null (opted out, or nothing live). */
  pack: EventThemePack | null;
  /** Whether any event is running now, theme or not: the menu offers the events page only then. */
  live: boolean;
  optedOut: boolean;
  setOptedOut: (value: boolean) => void;
  /** Resolves again now (e.g. on a screen transition near the event boundary). */
  refresh: () => void;
}

const EventThemeContext = createContext<EventThemeValue>({
  pack: null,
  live: false,
  optedOut: false,
  setOptedOut: () => {},
  refresh: () => {},
});

/** How often live events are re-polled, so the theme reverts near a boundary. */
const POLL_MS = 60_000;

/**
 * Tracks the active event theme app-wide. Live events are re-polled on mount, on return from the background, and on
 * a slow interval that stops in the background, so the theme applies while an event runs and reverts when it ends,
 * with no stored state to go stale. Opting out gives null.
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
      // react-native-web returns nothing where the page cannot report its visibility.
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
    <EventThemeContext.Provider value={{ pack, live: active.length > 0, optedOut, setOptedOut, refresh }}>
      {children}
    </EventThemeContext.Provider>
  );
}

export function useEventTheme(): EventThemeValue {
  return useContext(EventThemeContext);
}
