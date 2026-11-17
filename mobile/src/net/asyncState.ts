import type { ApiError } from '../api/types';
import { describeError, isOffline, isRetryable, type Translate } from '../api/errors';

/** The state a data screen is in: loading, offline, error with retry, empty or ready. */
export type AsyncStatus =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string; retryable: boolean }
  | { kind: 'empty' }
  | { kind: 'ready' };

export interface AsyncInput {
  /** The translator, because a screen state carries a sentence a person reads. */
  t: Translate;
  /** A request is in flight and we have nothing to show yet. */
  loading: boolean;
  /** Live connectivity (useIsOnline). */
  online: boolean;
  /** The last request's error, if any. */
  error?: ApiError | null;
  /** The request succeeded but returned nothing. */
  isEmpty?: boolean;
}

/**
 * Derive the screen state, in this order so the user is never stuck:
 *   - an error: offline if it looks like lost connectivity, else error with retry
 *   - offline while still loading: offline, not an endless spinner
 *   - loading
 *   - offline with nothing to show: offline
 *   - an empty result: empty
 *   - otherwise ready
 */
export function deriveAsyncState(input: AsyncInput): AsyncStatus {
  const { loading, online, error, isEmpty = false, t } = input;

  if (error) {
    return isOffline(error) || !online
      ? { kind: 'offline' }
      : { kind: 'error', message: describeError(error, t), retryable: isRetryable(error) };
  }
  if (!online && loading) return { kind: 'offline' };
  if (loading) return { kind: 'loading' };
  if (!online && isEmpty) return { kind: 'offline' };
  if (isEmpty) return { kind: 'empty' };
  return { kind: 'ready' };
}
