import type { ApiError } from '../api/types';
import { describeError, isOffline, isRetryable, type Translate } from '../api/errors';

/**
 * The state a data-driven screen is in (KUR-278). A single discriminated union so
 * every screen renders one of loading / offline / error+retry / empty / ready —
 * never an infinite spinner or a blank screen.
 */
export type AsyncStatus =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'error'; message: string; retryable: boolean }
  | { kind: 'empty' }
  | { kind: 'ready' };

export interface AsyncInput {
  /** the translator, because a screen state carries a sentence a person reads */
  t: Translate;
  /** a request is in flight and we have nothing to show yet */
  loading: boolean;
  /** live connectivity (useIsOnline) */
  online: boolean;
  /** the last request's error, if any */
  error?: ApiError | null;
  /** the request succeeded but returned nothing */
  isEmpty?: boolean;
}

/**
 * Derive the screen state. Order matters and is chosen so the user is never stuck:
 *   - a real error → offline (if it looks like lost connectivity) or error+retry
 *   - offline while still loading → show offline, not a spinner that never ends
 *   - loading → loading
 *   - offline with nothing to show → offline
 *   - empty result → empty
 *   - otherwise → ready
 * Pure, so it's fully unit-testable; the component only renders what this returns.
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
