import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from './api';

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * GET a path through the shared API client with loading/error/data states.
 * Re-runs when `path` changes. `reload` refetches on demand (e.g. retry button).
 */
export function useApiGet<T>(path: string): State<T> & { reload: () => void } {
  const { client } = useAuth();
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    void client.get<T>(path).then((res) => {
      if (cancelled) return;
      if (res.ok) setState({ data: res.data, error: null, loading: false });
      else setState({ data: null, error: describeError(res.error), loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [client, path, nonce]);

  return { ...state, reload };
}
