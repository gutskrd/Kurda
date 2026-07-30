import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '../auth/AuthContext';
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
 * mount, when the app returns to the foreground, and on a slow interval, so the
 * theme applies while an event runs and reverts cleanly once it ends — there is
 * no persisted theme state to leave stale. Opt-out short-circuits to null.
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
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') refresh();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
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
