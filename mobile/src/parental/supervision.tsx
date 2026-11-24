import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { localDay, parentalPause, type ParentalPause, type ParentalSwitch, type SupervisionState } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { deviceTimeZone } from '../auth/timeZone';
import { usageBeat } from './api';
import { onParentalRefusal } from './refusals';
import { forgetTeens } from './teen';

/** A beat a minute while the app is in front: the server counts at most one minute per 50 seconds, so this is the cadence. */
export const BEAT_MS = 60_000;

/** The pause in force, if any. */
export interface PauseNow {
  paused: ParentalPause;
  resumesAt: string | null;
}

interface SupervisionValue {
  /** The account's own supervision as a teen, or null for everyone it does not apply to. */
  state: SupervisionState | null;
  /** The pause in force now, worked out on this phone's clock from the latest numbers (shared `parentalPause`). */
  pause: PauseNow;
  /** A newer state from a page that read it (connecting, disconnecting, the parental page itself). */
  take: (next: SupervisionState | null) => void;
}

const NOT_PAUSED: PauseNow = { paused: null, resumesAt: null };
const UNSUPERVISED: SupervisionValue = { state: null, pause: NOT_PAUSED, take: () => undefined };

const SupervisionContext = createContext<SupervisionValue>(UNSUPERVISED);

/** The state as received, and the teen's day it was counted on, so a new day starts from no minutes before its first beat. */
interface Held {
  state: SupervisionState;
  day: string;
}

const hold = (state: SupervisionState | null): Held | null => (state ? { state, day: localDay(new Date(), state.timeZone) } : null);

/**
 * A supervised teen's limits, kept current for the whole app. Mounted once inside the session. Seeded from `/me`, it
 * beats `POST /me/usage` once on coming to the front and then every minute while the app stays there, only for an
 * account that is supervised, so nobody else pays for it; an answer with nothing in it means supervision has ended and
 * the beating stops. The pause is recomputed on the clock, so bedtime starts on time and a pause lifts the moment it
 * ends, without waiting for the server.
 */
export function SupervisionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const { client, user, status, refreshUser } = useAuth();
  const signedIn = status === 'signedIn' && !!user && user.guest !== true;
  const fromMe = signedIn ? (user?.supervision ?? null) : null;
  const [held, setHeld] = useState<Held | null>(() => hold(fromMe));
  const take = useCallback((next: SupervisionState | null) => setHeld(hold(next)), []);

  // Every fresh read of the account brings its own state, and signing out drops it.
  useEffect(() => setHeld(hold(fromMe)), [fromMe]);
  // What one account read of a teen is never shown to the next on this phone.
  const userId = signedIn ? user?.id : undefined;
  useEffect(() => forgetTeens, [userId]);

  const supervised = held !== null;
  // The beat to send at once when a write meets a parent's switch; unsupervised, the account itself is read again.
  const beatNow = useRef<(() => void) | null>(null);
  useEffect(
    () =>
      onParentalRefusal(() => {
        if (beatNow.current) beatNow.current();
        else if (signedIn) void refreshUser();
      }),
    [refreshUser, signedIn],
  );
  useEffect(() => {
    if (!supervised) return;
    let live = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const beat = async (): Promise<void> => {
      const res = await usageBeat(client, deviceTimeZone() ?? 'UTC');
      // A failed beat keeps the last numbers: the clock still applies them, and the next beat tries again.
      if (!live || !res.ok) return;
      setHeld(hold(res.data ?? null));
    };
    const stop = (): void => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = (): void => {
      stop();
      void beat();
      timer = setInterval(() => void beat(), BEAT_MS);
    };
    // Unknown counts as in front, as the haptics do.
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') start();
    const sub = AppState.addEventListener('change', (next) => (next === 'active' ? start() : stop()));
    beatNow.current = () => void beat();
    return () => {
      live = false;
      beatNow.current = null;
      stop();
      // react-native-web hands back nothing where the page cannot say whether it is visible.
      sub?.remove();
    };
  }, [client, supervised]);

  const now = useClock(held);
  const pause = useMemo<PauseNow>(() => {
    if (!held) return NOT_PAUSED;
    const { controls, minutesToday, timeZone } = held.state;
    const minutes = localDay(new Date(now), timeZone) === held.day ? minutesToday : 0;
    return parentalPause(controls, minutes, new Date(now), timeZone);
  }, [held, now]);

  const value = useMemo<SupervisionValue>(() => ({ state: held?.state ?? null, pause, take }), [held, pause, take]);
  return <SupervisionContext.Provider value={value}>{children}</SupervisionContext.Provider>;
}

/**
 * The time, moved on just after each whole minute and on coming back to the front. Bedtimes and midnight fall on whole
 * minutes, so a pause starts and lifts on time. Idle for everyone who is not supervised.
 */
function useClock(held: Held | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => setNow(Date.now()), 60_000 - (Date.now() % 60_000) + 50);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setNow(Date.now());
    });
    return () => {
      clearTimeout(timer);
      sub?.remove();
    };
  }, [held, now]);
  return now;
}

export function useSupervision(): SupervisionValue {
  return useContext(SupervisionContext);
}

/** Whether a parent has switched this part of Hevalo off for this account; false for anyone not supervised. */
export function useParentalOff(part: ParentalSwitch): boolean {
  const { state } = useSupervision();
  return state?.controls[part] === false;
}
