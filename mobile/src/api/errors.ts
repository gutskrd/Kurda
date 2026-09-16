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

/**
 * Server codes precise enough to say in the reader’s own language.
 *
 * The API raises 114 distinct codes and every message is English, so this is
 * a floor, not a ceiling: the auth flow first, because it is the one every
 * reader meets. Seventeen of those codes carry more than one message —
 * FORBIDDEN alone has seven — and a code that vague cannot be translated
 * from the code alone, so it is left to fall through.
 */
export const CODE_COPY: Record<string, TranslationKey> = {
  ACCOUNT_NOT_ACTIVATED: 'error.notActivated',
  ACCOUNT_DISABLED: 'error.code.accountDisabled',
  CODE_EXPIRED: 'error.code.codeExpired',
  INVALID_CODE: 'error.code.invalidCode',
  INVALID_CREDENTIALS: 'error.code.invalidCredentials',
  INVALID_TOKEN: 'error.code.invalidLink',
  LOCKED: 'error.code.locked',
  SIGNUP_REJECTED: 'error.code.signupRejected',
  TOO_MANY_ATTEMPTS: 'error.code.tooManyAttempts',
  USERNAME_TAKEN: 'error.code.usernameTaken',
};
export function describeError(error: ApiError, t: Translate): string {
  // A live countdown beats any sentence, so it wins when the server sent one.
  // It only does for RATE_LIMITED today: LOCKED knows exactly how long it has
  // locked you out and puts the number in details, which nothing turns into a
  // retry-after header — so that branch is waiting for an API fix rather than
  // being unreachable.
  if (error.kind === 'rate_limited' && error.retryAfterSec && error.retryAfterSec > 0) {
    return t('error.tooManyRetryIn', { seconds: Math.max(1, Math.ceil(error.retryAfterSec)) });
  }

  // Otherwise a precise code beats the kind: the difference between "something
  // went wrong" and "that code has expired".
  const byCode = error.code ? CODE_COPY[error.code] : undefined;
  if (byCode) return t(byCode);
  switch (error.kind) {
    case 'network':
      return t('error.offline');
    case 'server':
      return t('error.server');
    case 'rate_limited':
      // without a countdown, which the branch at the top already took
      return t('error.tooMany');
    case 'unauthorized':
      // INVALID_CREDENTIALS is answered by code above, so what reaches here is
      // a mid-session refresh failure — or a 401 we have no copy for, whose
      // own message is still better than nothing.
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
