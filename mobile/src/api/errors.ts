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
import { isMissingRoute } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { ApiError } from './types';
import { FIELD_ERROR_VARS, PASSWORD_RULES_KEY } from '../auth/validators';
import { limitErrorText } from '../limits/limitCopy';

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
  // never which of the two was wrong: that would tell a stranger the address has an account
  INVALID_CREDENTIALS: 'error.code.invalidCredentials',
  INVALID_TOKEN: 'error.code.invalidLink',
  // without a wait the server named; with one, `lockedFor` says how long
  LOCKED: 'error.code.locked',
  /*
   * Sign-in wants the challenge after several failed attempts. No challenge
   * is configured in production yet, so there is nothing to show but a calm
   * pause and the reset that does not wait (the login form offers it).
   */
  CAPTCHA_REQUIRED: 'error.code.captchaRequired',
  // a new password found in a data leak: sign-up, reset and change
  PASSWORD_BREACHED: 'error.code.passwordBreached',
  // changing the password while signed in (POST /me/password)
  WRONG_PASSWORD: 'error.code.wrongPassword',
  NO_PASSWORD: 'error.code.noPassword',
  SESSION_NOT_FOUND: 'error.code.sessionNotFound',
  SIGNUP_REJECTED: 'error.code.signupRejected',
  /*
   * An address that already has an account. The server keeps this vague on
   * purpose, so nobody can learn which addresses are registered; the words
   * stay as vague, and point at the two ways forward for whoever it is.
   */
  REGISTRATION_FAILED: 'error.code.registrationFailed',
  // a sign-in the server wants to check before it lets it through
  LOGIN_VERIFICATION_REQUIRED: 'error.code.loginCheck',
  INVALID_OAUTH_TOKEN: 'error.code.oauthFailed',
  OAUTH_NOT_CONFIGURED: 'error.code.oauthUnavailable',
  // a session that has run out, however the server put it
  UNAUTHORIZED: 'error.sessionExpired',
  INVALID_REFRESH: 'error.sessionExpired',
  REFRESH_EXPIRED: 'error.sessionExpired',
  REFRESH_REUSED: 'error.sessionExpired',
  TOO_MANY_ATTEMPTS: 'error.code.tooManyAttempts',
  USERNAME_TAKEN: 'error.code.usernameTaken',
  // age and the protections that follow from it — the browser says the same
  UNDER_MINIMUM_AGE: 'error.code.underMinimumAge',
  INVALID_BIRTH_MONTH: 'error.code.invalidBirthMonth',
  BIRTH_DATE_ALREADY_SET: 'error.code.birthDateAlreadySet',
  OPEN_GROUPS_ADULTS_ONLY: 'error.code.openGroupsAdultsOnly',
  VISIBILITY_NOT_ALLOWED: 'error.code.visibilityNotAllowed',
  LEARN_FIRST: 'error.code.learnFirst',
};
/**
 * Codes whose code alone is not enough: which rule a password or a username
 * broke (`details.reason`, api/src/auth/password-policy.ts and
 * api/src/users/username.ts), and which field of a form the server could not
 * accept. The password's reasons get the words the phone's own field check
 * already says; the browser says the same things for the same reasons.
 */
const PASSWORD_REASON: Record<string, TranslationKey> = {
  'too-short': 'field.passwordTooShort',
  'too-long': 'field.passwordTooLong',
  'needs-letter': 'field.passwordNeedsLetter',
  'needs-number': 'field.passwordNeedsNumber',
};
const USERNAME_REASON: Record<string, TranslationKey> = {
  'too-short': 'field.invalidUsername',
  'too-long': 'field.invalidUsername',
  'invalid-chars': 'error.code.usernameChars',
  'edge-underscore': 'error.code.usernameUnderscore',
  'consecutive-underscore': 'error.code.usernameUnderscore',
  'numbers-only': 'error.code.usernameLetter',
  'no-letter': 'error.code.usernameLetter',
  reserved: 'error.code.usernameUnavailable',
};

function byReason(error: ApiError, t: Translate): string | null {
  const reason = (error.details as { reason?: unknown } | undefined)?.reason;
  const key = typeof reason === 'string' ? reason : '';
  if (error.code === 'WEAK_PASSWORD') return t(PASSWORD_REASON[key] ?? PASSWORD_RULES_KEY, FIELD_ERROR_VARS);
  if (error.code === 'INVALID_USERNAME') return t(USERNAME_REASON[key] ?? 'error.code.usernameChars', FIELD_ERROR_VARS);
  if (error.code === 'VALIDATION_ERROR') {
    // the issues name the field; an email address is the one people most often mistype
    const issues = Array.isArray(error.details) ? (error.details as Array<{ path?: unknown }>) : [];
    const email = issues.some((i) => Array.isArray(i.path) && i.path.includes('email'));
    return t(email ? 'error.code.badEmail' : 'error.code.checkDetails');
  }
  return null;
}

/**
 * How long a locked sign-in waits, in words: "about 15 minutes", never 792
 * seconds. Past ten minutes the wait is rounded up to five, because the
 * number is the server's estimate of a lock that it may lift early, and
 * "about 14 minutes" claims a precision nobody needs.
 */
export function lockedFor(seconds: number, t: Translate): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  if (minutes <= 1) return t('error.code.lockedMinute');
  if (minutes < 10) return t('error.code.lockedMinutes', { count: minutes });
  const rounded = Math.ceil(minutes / 5) * 5;
  if (rounded < 60) return t('error.code.lockedMinutes', { count: rounded });
  const hours = Math.round(minutes / 60);
  return hours <= 1 ? t('error.code.lockedHour') : t('error.code.lockedHours', { count: hours });
}

export function describeError(error: ApiError, t: Translate): string {
  // A limit on how many of something one person may have (limits/limitCopy.ts):
  // which one, its number and what makes room, before any countdown — a full
  // list of drafts does not empty by waiting a minute.
  const limit = limitErrorText(error, t);
  if (limit) return limit;

  // A lock says how long it lasts, in the body and the Retry-After header both.
  if (error.code === 'LOCKED') {
    const inDetails = (error.details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec;
    const seconds = typeof inDetails === 'number' && inDetails > 0 ? inDetails : error.retryAfterSec;
    if (seconds && seconds > 0) return lockedFor(seconds, t);
  }
  // A live countdown beats any sentence, so it wins when the server sent one.
  if (error.kind === 'rate_limited' && error.retryAfterSec && error.retryAfterSec > 0) {
    // A lockout is minutes. The copy that only ever saw a rate limiter said
    // seconds, and a real lockout came back as 792 of them.
    const wait = Math.max(1, Math.ceil(error.retryAfterSec));
    return wait >= 90
      ? t('error.tooManyRetryInMin', { minutes: Math.ceil(wait / 60) })
      : t('error.tooManyRetryIn', { seconds: wait });
  }

  // Otherwise a precise code beats the kind: the difference between "something
  // went wrong" and "that code has expired".
  const byCode = error.code ? CODE_COPY[error.code] : undefined;
  if (byCode) return t(byCode);
  const reasoned = byReason(error, t);
  if (reasoned) return reasoned;
  // A route the API does not have: this build is newer than the server it
  // talks to (a game invite from a build whose API is not deployed yet), and
  // "route not found" is no sentence for a reader (@kurda/shared isMissingRoute).
  if (isMissingRoute(error)) return t('error.notOnServer');
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
