/**
 * Loading what a page shows, the same way on every page: the data, the
 * failure (kept, never turned into "nothing here"), whether a load is running,
 * and a reload. A slower, older request that answers after a newer one is
 * dropped — the Games search fired a request per keystroke, and whichever
 * answered last won, so the list could show the results for "hev" under "heval".
 */
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface Loaded<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  /** change what is shown without asking the server (after a save that answered with the new row) */
  setData: (next: T | ((prev: T | undefined) => T)) => void;
}

export function useLoad<T>(load: () => Promise<T>, deps: DependencyList): Loaded<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  const alive = useRef(true);
  // the caller's deps decide when to load again, as with useEffect
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

/** The value, once it has stopped changing for `ms` — what a search box sends. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}
