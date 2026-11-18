import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from './api';
import { GUEST, ask, justAnswered, lastAnswer } from './apiMemory';
import { useT } from '../i18n/I18nProvider';

/** A request's state as a screen holds it: the data, the error, or still loading. */
export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Whose answers the memory may hand over (lib/apiMemory.ts): the signed-in person's, a visitor's, or nobody's while the
 * stored session is still being checked; answers then are kept for nobody.
 */
export function useMemoryOwner(): string | null {
  const { status, user } = useAuth();
  if (status === 'restoring') return null;
  return status === 'signedIn' && user ? user.id : GUEST;
}

/**
 * GETs a path through the shared client with loading, error and data states, again whenever `path` changes or
 * `reload` is called.
 *
 * A path asked before in this tab is answered at once from memory (lib/apiMemory.ts) and refreshed behind that; a
 * network or server failure keeps the last answer, while a refusal replaces it with the error. `fresh` skips the
 * memory for anything that must never be shown late (game state, lobbies, lessons, reports, account standing). A null
 * path asks nothing.
 */
export function useApiGet<T>(path: string | null, { fresh = false }: { fresh?: boolean } = {}): ApiState<T> & { reload: () => void } {
  const { client } = useAuth();
  const t = useT();
  const who = useMemoryOwner();
  const memory = fresh ? null : who;
  const [state, setState] = useState<ApiState<T>>(() => {
    if (path === null) return { data: null, error: null, loading: false };
    const kept = memory ? lastAnswer<T>(memory, path) : null;
    return kept ? { data: kept.data, error: null, loading: false } : { data: null, error: null, loading: true };
  });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // The reload the last request answered, so only an explicit reload skips the just-answered check.
  const asked = useRef(0);
  // The memory owner when the question is asked; learning who is here is no reason to ask again.
  const memoryNow = useRef(memory);
  memoryNow.current = memory;

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    const memory = memoryNow.current;
    const reloading = nonce !== asked.current;
    asked.current = nonce;
    const kept = memory ? lastAnswer<T>(memory, path) : null;
    if (kept) {
      // Shown at once; if another part of the page has only just been given it, that is the answer.
      setState((s) => (s.data === kept.data && !s.loading && s.error === null ? s : { data: kept.data, error: null, loading: false }));
      if (!reloading && memory && justAnswered(memory, path)) return;
    } else {
      setState((s) => ({ ...s, loading: true, error: null }));
    }
    const request = memory ? ask<T>(client, memory, path) : client.get<T>(path);
    void request.then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setState((s) => (s.data === res.data && !s.loading && s.error === null ? s : { data: res.data, error: null, loading: false }));
        return;
      }
      // A network or server failure is no reason to take away what is on screen.
      const stillThere = kept !== null && memory !== null && lastAnswer<T>(memory, path) !== null;
      if (stillThere) return;
      setState({ data: null, error: describeError(res.error, t), loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [client, path, nonce, t]);
  return { ...state, reload };
}
