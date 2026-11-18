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

/** GET /events/active; `nextChangeAt` is absent from older servers. */
interface ActiveEvents {
  events: ActiveEventLite[];
  nextChangeAt?: string | null;
}

/** The wait when the next change is not known: an older server, no answer, or a phone clock that runs ahead. */
const RETRY_MS = 60_000;
/** The longest wait, so an admin's edit to an event still reaches the phone. */
export const MAX_WAIT_MS = 15 * 60_000;
/** Asked this long after the boundary, so the server is past it too. */
const MARGIN_MS = 2_000;

/** How long to wait before asking again, given the server's next boundary. */
export function nextAskIn(nextChangeAt: string | null | undefined, now: number): number {
  if (nextChangeAt === undefined) return RETRY_MS;
  if (nextChangeAt === null) return MAX_WAIT_MS;
  const wait = Date.parse(nextChangeAt) - now;
  // A boundary already passed here but not on the server: this phone's clock runs ahead.
  if (!(wait > 0)) return RETRY_MS;
  return Math.min(MAX_WAIT_MS, wait + MARGIN_MS);
}

/**
 * Tracks the active event theme app-wide. Live events are read on mount, on return from the background, and again
 * just after the next boundary the server gives (at most MAX_WAIT_MS later), with nothing timed in the background,
 * so the theme applies while an event runs and reverts when it ends, with no stored state to go stale. Opting out
 * gives null.
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

  // Reads the live events and resolves how long until they should be read again (null: not signed in).
  const refresh = useCallback(async (): Promise<number | null> => {
    if (status !== 'signedIn') {
      setActive([]);
      return null;
    }
    const res = await client.get<ActiveEvents>('/events/active');
    if (mounted.current && res.ok) setActive(res.data.events);
    return nextAskIn(res.ok ? res.data.nextChangeAt : undefined, Date.now());
  }, [client, status]);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = (): void => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const ask = (): void => {
      stop();
      void refresh().then((wait) => {
        if (!live || wait === null || AppState.currentState === 'background') return;
        stop();
        timer = setTimeout(ask, wait);
      });
    };
    ask();
    const away = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'background') stop();
    });
    const stopListening = onBackFromBackground(AppState, ask);
    return () => {
      live = false;
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
