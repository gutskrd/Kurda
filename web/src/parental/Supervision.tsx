import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PARENTAL_SWITCHES, parentalPause, type SupervisionState } from '@kurda/shared';
import { useAuth, useSessionUser } from '../auth/AuthProvider';
import { isFocusedPath } from '../layouts/focus';
import { under } from '../layouts/roots';
import { onParentalRefusal } from '../lib/api';
import { pageVisible } from '../lib/pollWhileVisible';
import { PauseScreen } from './PauseScreen';
import './parental.css';

/**
 * A supervised teen's limits as they stand right now, kept for the whole app: read with the account, then from a usage
 * beat once a minute while Hevalo is in front of them, which the server counts towards their day. Nobody else beats,
 * so it costs nothing for anyone who is not supervised. While their parent's bedtime or daily limit holds, the app gives
 * way to the pause screen, though never in the middle of a lesson they had already started.
 */

/** How often a beat is sent, counting only time the page is in view. */
export const BEAT_MS = 60_000;
/** How often the page checks it is still in view, and whether a bedtime has just begun. */
const STEP_MS = 5_000;
/** The longest delay a browser timer keeps. */
const MAX_TIMER_MS = 2 ** 31 - 1;

interface SupervisionValue {
  /** Null for everyone but a supervised teen. */
  state: SupervisionState | null;
  /** Takes a fresh answer from a page that read one, such as the teen's own parental page after connecting. */
  adopt: (next: SupervisionState | null) => void;
}

const SupervisionContext = createContext<SupervisionValue | null>(null);

/** The teen's time zone, as the device reports it. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Calls `beat` once every `everyMs` of time the page is in view; returns the stop. */
export function startUsageBeat(beat: () => void, onStep: () => void = () => undefined, everyMs = BEAT_MS): () => void {
  let seen = 0;
  const timer = setInterval(() => {
    onStep();
    if (!pageVisible()) return;
    seen += STEP_MS;
    if (seen < everyMs) return;
    seen = 0;
    beat();
  }, STEP_MS);
  return () => clearInterval(timer);
}

export function SupervisionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { status, user, client, refreshUser } = useAuth();
  const fromAccount = status === 'signedIn' ? (user?.supervision ?? null) : null;
  const [state, setState] = useState<SupervisionState | null>(fromAccount);
  // Each new read of the account is the latest word, until a beat says otherwise; taken while drawing, so the pause
  // never trails the account by a frame.
  const [read, setRead] = useState(fromAccount);
  if (read !== fromAccount) {
    setRead(fromAccount);
    setState(fromAccount);
  }

  const supervised = state !== null;
  const latest = useRef(state);
  latest.current = state;
  useEffect(() => {
    if (!supervised) return;
    const beat = (): void => {
      void client.post<SupervisionState | undefined>('/me/usage', { timeZone: deviceTimeZone() }).then((res) => {
        // A 204 says the supervision has ended, so the beat stops with it.
        if (res.ok) setState(res.data ?? null);
      });
    };
    // A bedtime begins on the minute, not at the next beat.
    const check = (): void => {
      const now = latest.current;
      if (!now || now.paused) return;
      const due = parentalPause(now.controls, now.minutesToday, new Date(), now.timeZone);
      if (due.paused) setState({ ...now, ...due });
    };
    return startUsageBeat(beat, check);
  }, [supervised, client]);

  // A pause lifts by itself when it ends, and the account is read again to be sure of the new day.
  const resumesAt = state?.paused ? state.resumesAt : null;
  useEffect(() => {
    if (!resumesAt) return;
    const wait = Math.max(0, Date.parse(resumesAt) - Date.now()) + 1000;
    // Past what a timer can hold (about 24 days) it would fire at once; no pause is that long.
    if (!(wait < MAX_TIMER_MS)) return;
    const timer = setTimeout(() => {
      setState((s) => (s ? { ...s, paused: null, resumesAt: null, minutesToday: s.paused === 'limit' ? 0 : s.minutesToday } : s));
      void refreshUser();
    }, wait);
    return () => clearTimeout(timer);
  }, [resumesAt, refreshUser]);

  // A write refused for a pause or a switched-off part says so at once; the next beat or read of the account confirms it.
  useEffect(
    () =>
      onParentalRefusal((code, details) => {
        const d = (details && typeof details === 'object' ? details : {}) as { paused?: unknown; resumesAt?: unknown; control?: unknown };
        setState((s) => {
          if (!s) return s;
          if (code === 'PARENTAL_PAUSED' && (d.paused === 'bedtime' || d.paused === 'limit')) {
            return { ...s, paused: d.paused, resumesAt: typeof d.resumesAt === 'string' ? d.resumesAt : s.resumesAt };
          }
          if (code === 'PARENTAL_BLOCKED' && typeof d.control === 'string' && (PARENTAL_SWITCHES as readonly string[]).includes(d.control)) {
            return { ...s, controls: { ...s.controls, [d.control]: false } };
          }
          return s;
        });
      }),
    [],
  );

  const adopt = useCallback((next: SupervisionState | null) => setState(next), []);
  const value = useMemo(() => ({ state, adopt }), [state, adopt]);
  return <SupervisionContext.Provider value={value}>{children}</SupervisionContext.Provider>;
}

/** The teen's supervision now; without the provider (a test, a page on its own), what the account last said. */
export function useSupervision(): SupervisionValue {
  const held = useContext(SupervisionContext);
  const fromAccount = useSessionUser()?.supervision ?? null;
  return held ?? { state: fromAccount, adopt: () => undefined };
}

/**
 * The app, or the pause screen in its place while the teen's parent has Hevalo resting. A lesson open when the pause
 * began is finished first; the teen's own parental page stays open, so they can see what was set.
 */
export function PauseGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { state } = useSupervision();
  const { status } = useAuth();
  const { pathname } = useLocation();
  const paused = state?.paused ?? null;
  // The lesson that was open as the pause began, which may be finished; one opened afterwards, or the app opened on a
  // lesson's address while resting, may not. Worked out while drawing, so a lesson never flashes the pause for a frame.
  const [seen, setSeen] = useState<typeof paused | undefined>(undefined);
  const [finishing, setFinishing] = useState<string | null>(null);
  if (status === 'signedIn' && paused !== seen) {
    setSeen(paused);
    setFinishing(seen !== undefined && paused && isFocusedPath(pathname) ? pathname : null);
  }
  if (finishing !== null && finishing !== pathname) setFinishing(null);

  const openToRead = !under(pathname, '/app') || under(pathname, '/app/settings/parental');
  if (state && paused && !openToRead && finishing !== pathname) return <PauseScreen state={state} />;
  return <>{children}</>;
}
