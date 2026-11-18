/**
 * The hooks every page shares. `useLoad` gives the data, the failure (never turned into "nothing here"), whether a
 * load is running and a reload, and drops an older request that answers after a newer one, so a search box never
 * shows the results for an earlier query.
 */
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface Loaded<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  /** Change what is shown without asking the server (after a save that answered with the new row). */
  setData: (next: T | ((prev: T | undefined) => T)) => void;
}

export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): Loaded<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const alive = useRef(true);
  // The caller's deps decide when to load again, as with useEffect.
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const value = await run();
      if (ticket !== latest.current || !alive.current) return;
      setData(value);
      setError(null);
    } catch (err) {
      if (ticket !== latest.current || !alive.current) return;
      setError(err);
    } finally {
      if (ticket === latest.current && alive.current) setLoading(false);
    }
  }, [run]);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Whether a media query matches, kept up to date, for markup that differs on a phone; `fallback` without matchMedia. */
export function useMediaQuery(query: string, fallback = true): boolean {
  const read = (): boolean => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : fallback);
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = (): void => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Whether the system asks for less motion right now; false where there is no matchMedia. */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Whole seconds left until `until` (a Date.now() time), ticking each second, 0 once passed: for a lockout's button.
 * Worked out on every render, so the first render after a lockout already knows it is waiting.
 */
export function useCountdown(until: number | null): number {
  const [, tick] = useState(0);
  const left = until === null ? 0 : Math.max(0, Math.ceil((until - Date.now()) / 1000));
  useEffect(() => {
    if (until === null) return;
    const timer = window.setInterval(() => {
      tick((n) => n + 1);
      if (Date.now() >= until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  return left;
}

/** The value, once it has stopped changing for `ms` — what a search box sends. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}
