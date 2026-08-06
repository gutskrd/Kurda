/**
 * User-facing error mapping (KUR-278). Turns an {@link ApiError} into a short,
 * friendly message plus retry/offline flags, so screens stop showing raw
 * technical strings ("request failed (500)") and duplicating `kind` checks.
 *
 * Only the infrastructure kinds (network / server / rate_limited) get a rewritten
 * message — for `client` and `unauthorized` the server's own message is usually
 * the actionable one (validation errors, wrong credentials, …), so it passes
 * through. That keeps a failed login reading "incorrect password", not a generic
 * "session expired".
 */
import type { ApiError } from './types';

export interface ErrorDescription {
  /** A short, user-facing sentence — never server/technical detail. */
  message: string;
  /** The same action can be meaningfully retried. */
  retryable: boolean;
  /** The failure looks like lost connectivity (drives the offline banner). */
  offline: boolean;
}

/** "45 seconds" / "1 minute" / "3 minutes" — for rate-limit wait hints. */
export function formatDuration(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.round(s / 60);
  return `${m} minute${m === 1 ? '' : 's'}`;
}

function rateLimitMessage(retryAfterSec?: number): string {
  return retryAfterSec && retryAfterSec > 0
    ? `You’re doing that too fast — try again in ${formatDuration(retryAfterSec)}.`
    : 'You’re doing that too fast. Please try again shortly.';
}

export function describeError(error: ApiError): ErrorDescription {
  switch (error.kind) {
    case 'network':
      return { message: 'You appear to be offline. Check your connection and try again.', retryable: true, offline: true };
    case 'server':
      return { message: 'Something went wrong on our end. Please try again in a moment.', retryable: true, offline: false };
    case 'rate_limited':
      return { message: rateLimitMessage(error.retryAfterSec), retryable: true, offline: false };
    case 'unauthorized':
    case 'client':
    default:
      return { message: error.message || 'That didn’t work. Please try again.', retryable: false, offline: false };
  }
}
