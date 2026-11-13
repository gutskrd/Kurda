import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from './api';
import { GUEST, ask, justAnswered, lastAnswer } from './apiMemory';
import { useT } from '../i18n/I18nProvider';

/** A question's answer as a screen holds it: the data, or why not, or still waiting. */
export interface ApiState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Whose answers the memory may hand over (lib/apiMemory.ts): the signed-in
 * person's, a visitor's, or nobody's while it is still being found out who is
 * here — a request made then is answered for whoever the stored session turns
 * out to be, and is kept for nobody.
 */
export function useMemoryOwner(): string | null {
  const { status, user } = useAuth();
  if (status === 'restoring') return null;
  return status === 'signedIn' && user ? user.id : GUEST;
}

/**
 * GET a path through the shared API client with loading/error/data states.
 * Re-runs when `path` changes. `reload` refetches on demand (e.g. retry button).
 *
 * A path this tab has asked before is answered at once from memory
 * (lib/apiMemory.ts) — `loading` is false and the last answer is the data —
 * and is asked again behind that, so the screen is there before the network
 * is and catches up when it answers. A failure of the network or the server
 * then leaves the last answer showing; a refusal of the question itself
 * replaces it with the error, as before.
 *
 * `fresh` is the way out, for anything that must never be shown a moment
 * old: a game's state, a lobby, a lesson in progress, a report, where an
 * account stands. Nothing is read from memory or kept in it, and every mount
 * and every `reload` asks the server, exactly as this hook always did.
 *
 * A `null` path asks nothing: for a caller that was handed the answer by
 * whoever rendered it, and has no need to ask again.
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
  // which reload the last request answered, so only an asked-for reload skips "it was only just answered"
  const asked = useRef(0);
  // whose memory, as it is when the question is asked: finding out who is here is not a reason to ask again
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
      // shown at once; and when another part of this page has only just been given it, that is the answer
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
      // the network or the server failing is no reason to take away what is already on the screen
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
