/**
 * User-facing error mapping (KUR-278). Turns an {@link ApiError} into a short,
 * friendly sentence in the reader's own language, so screens stop showing raw
 * technical strings ("request failed (500)") and duplicating `kind` checks.
 *
 * Only the infrastructure kinds (network / server / rate_limited) get a
 * rewritten message — for `client` and `unauthorized` the server's own message
 * is usually the actionable one (validation errors, wrong credentials, …), so
 * it passes through. That keeps a failed login reading "incorrect password",
 * not a generic "session expired". Those pass-through messages are the API's
 * and are still English; translating them means giving the server a locale,
 * which is its own piece of work.
 *
 * The translator is a parameter rather than a hook because this is a plain
 * module with no React in it — the same shape the browser's `describeError`
 * has, so the two apps answer the same failure with the same sentence.
 */
import type { TranslationKey } from '../i18n/translations';
import type { ApiError } from './types';

export type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

export function describeError(error: ApiError, t: Translate): string {
  // The one server code worth saying in the reader's own language: it is a 403
  // like any other to this function, but it is not a refusal — it is an
  // instruction, and the account is one confirmed email away from working.
  if (error.code === 'ACCOUNT_NOT_ACTIVATED') return t('error.notActivated');
  switch (error.kind) {
    case 'network':
      return t('error.offline');
    case 'server':
      return t('error.server');
    case 'rate_limited':
      return error.retryAfterSec && error.retryAfterSec > 0
        ? t('error.tooManyRetryIn', { seconds: Math.max(1, Math.ceil(error.retryAfterSec)) })
        : t('error.tooMany');
    case 'unauthorized':
      // a bad login carries the server's own message; only mid-session
      // refresh-failures fall back to the generic session-expired copy
      return error.message && error.message !== 'session expired' ? error.message : t('error.sessionExpired');
    case 'client':
    default:
      return error.message || t('error.generic');
  }
}

/** Does this failure look like lost connectivity? Drives the offline banner. */
export function isOffline(error: ApiError): boolean {
  return error.kind === 'network';
}

/** Can the same action be meaningfully retried? */
export function isRetryable(error: ApiError): boolean {
  return error.kind === 'network' || error.kind === 'server' || error.kind === 'rate_limited';
}
