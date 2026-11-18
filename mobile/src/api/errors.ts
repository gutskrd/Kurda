/**
 * User-facing error mapping: turns an {@link ApiError} into a short sentence in the reader's language, so screens
 * do not show raw strings ("request failed (500)") or repeat `kind` checks. Infrastructure kinds (network,
 * server, rate_limited) and known codes get the app's own words; other `client` and `unauthorized` messages are
 * the server's (still English) and pass through.
 *
 * The translator is a parameter because this module has no React, and it matches the web app's `describeError`,
 * so both apps give the same sentence for the same failure.
 */
import { isMissingRoute, MAINTENANCE_CODE } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { ApiError } from './types';
import { FIELD_ERROR_VARS, PASSWORD_RULES_KEY } from '../auth/validators';
import { usernameMessage } from '../username/validate';
import { limitErrorText } from '../limits/limitCopy';

export type Translate = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/**
 * The server's refusal of a guest on account-only routes (social, public, purchasable). The gate
 * (auth/AccountGate) asks first where it can; the client watches for this code elsewhere.
 */
export const GUEST_ACCOUNT_CODE = 'GUEST_ACCOUNT';

/**
 * Server codes precise enough to say in the reader's language, starting with the auth flow, which every reader
 * meets. Codes that carry several different messages (FORBIDDEN has seven) cannot be translated from the code
 * alone, so they fall through.
 */
export const CODE_COPY: Record<string, TranslationKey> = {
  ACCOUNT_NOT_ACTIVATED: 'error.notActivated',
  ACCOUNT_DISABLED: 'error.code.accountDisabled',
  CODE_EXPIRED: 'error.code.codeExpired',
  INVALID_CODE: 'error.code.invalidCode',
  // Never which of the two was wrong: that would reveal the address has an account.
  INVALID_CREDENTIALS: 'error.code.invalidCredentials',
  INVALID_TOKEN: 'error.code.invalidLink',
  // Without a wait the server named; with one, `lockedFor` says how long.
  LOCKED: 'error.code.locked',
  /*
   * Sign-in asks for the challenge after several failed attempts. None is configured in production, so show a
   * calm pause and the reset that does not wait (the login form offers it).
   */
  CAPTCHA_REQUIRED: 'error.code.captchaRequired',
  // A new password found in a data leak: sign-up, reset and change.
  PASSWORD_BREACHED: 'error.code.passwordBreached',
  // Changing the password while signed in (POST /me/password).
  WRONG_PASSWORD: 'error.code.wrongPassword',
  NO_PASSWORD: 'error.code.noPassword',
  SESSION_NOT_FOUND: 'error.code.sessionNotFound',
  SIGNUP_REJECTED: 'error.code.signupRejected',
  /*
   * An address that already has an account. The server is vague on purpose so registered addresses cannot be
   * discovered; the words stay as vague and point to both ways forward.
   */
  REGISTRATION_FAILED: 'error.code.registrationFailed',
  VERIFICATION_EMAIL_LIMIT: 'error.code.verificationEmailLimit',
  // A sign-in the server wants to check before it lets it through.
  LOGIN_VERIFICATION_REQUIRED: 'error.code.loginCheck',
  INVALID_OAUTH_TOKEN: 'error.code.oauthFailed',
  OAUTH_NOT_CONFIGURED: 'error.code.oauthUnavailable',
  // Apple or Google names an address whose account here has not confirmed it yet: the password first.
  LINK_REQUIRES_VERIFIED_EMAIL: 'error.code.oauthLinkUnverified',
  // A session that has run out, however the server put it.
  UNAUTHORIZED: 'error.sessionExpired',
  INVALID_REFRESH: 'error.sessionExpired',
  REFRESH_EXPIRED: 'error.sessionExpired',
  REFRESH_REUSED: 'error.sessionExpired',
  TOO_MANY_ATTEMPTS: 'error.code.tooManyAttempts',
  USERNAME_TAKEN: 'error.code.usernameTaken',
  // Age and the protections that follow from it — the browser says the same.
  UNDER_MINIMUM_AGE: 'error.code.underMinimumAge',
  INVALID_BIRTH_MONTH: 'error.code.invalidBirthMonth',
  BIRTH_DATE_ALREADY_SET: 'error.code.birthDateAlreadySet',
  VISIBILITY_NOT_ALLOWED: 'error.code.visibilityNotAllowed',
  LEARN_FIRST: 'error.code.learnFirst',
  // A guest at something only an account may do; the gate's sheet says it first, and this is the text under it.
  [GUEST_ACCOUNT_CODE]: 'error.code.guestAccount',
  // Hevalo offline for a while: the screen over the app says the rest (maintenance/).
  MAINTENANCE: 'maintenance.title',
};
/**
 * Codes that need their details: which rule a password or username broke (`details.reason`,
 * api/src/auth/password-policy.ts and api/src/users/username.ts), and which form field the server rejected.
 * Password and username reasons use the same words as the phone's own field checks (username/validate.ts); the
 * web app matches.
 */
const PASSWORD_REASON: Record<string, TranslationKey> = {
  'too-short': 'field.passwordTooShort',
  'too-long': 'field.passwordTooLong',
  'needs-letter': 'field.passwordNeedsLetter',
  'needs-number': 'field.passwordNeedsNumber',
};

function byReason(error: ApiError, t: Translate): string | null {
  const reason = (error.details as { reason?: unknown } | undefined)?.reason;
  const key = typeof reason === 'string' ? reason : '';
  if (error.code === 'WEAK_PASSWORD') return t(PASSWORD_REASON[key] ?? PASSWORD_RULES_KEY, FIELD_ERROR_VARS);
  if (error.code === 'INVALID_USERNAME') {
    const said = usernameMessage(key, (error.details as { chars?: unknown } | undefined)?.chars);
    return t(said.message, said.vars);
  }
  if (error.code === 'VALIDATION_ERROR') {
    // The issues name the field; an email address is the one people most often mistype.
    const issues = Array.isArray(error.details) ? (error.details as Array<{ path?: unknown }>) : [];
    const email = issues.some((i) => Array.isArray(i.path) && i.path.includes('email'));
    return t(email ? 'error.code.badEmail' : 'error.code.checkDetails');
  }
  return null;
}

/**
 * How long a locked sign-in waits, in words: "about 15 minutes", never 792 seconds. Past ten minutes it rounds up
 * to five, since the server's estimate may lift early and finer precision helps nobody.
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
  // A count limit (limits/limitCopy.ts): which limit, its number and what makes room, before any countdown, since
  // a full list of drafts does not empty by waiting.
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
    // A lockout is measured in minutes, not seconds.
    const wait = Math.max(1, Math.ceil(error.retryAfterSec));
    return wait >= 90
      ? t('error.tooManyRetryInMin', { minutes: Math.ceil(wait / 60) })
      : t('error.tooManyRetryIn', { seconds: wait });
  }

  // Otherwise a precise code beats the kind ("that code has expired" rather than "something went wrong").
  const byCode = error.code ? CODE_COPY[error.code] : undefined;
  if (byCode) return t(byCode);
  const reasoned = byReason(error, t);
  if (reasoned) return reasoned;
  // A route the API lacks: this build is newer than its server, and "route not found" is no sentence for a reader
  // (@kurda/shared isMissingRoute).
  if (isMissingRoute(error)) return t('error.notOnServer');
  switch (error.kind) {
    case 'network':
      return t('error.offline');
    case 'server':
      return t('error.server');
    case 'rate_limited':
      // Without a countdown, which the branch at the top already took.
      return t('error.tooMany');
    case 'unauthorized':
      // INVALID_CREDENTIALS is handled by code above, so this is a mid-session refresh failure or an uncovered
      // 401, whose own message is better than nothing.
      return error.message && error.message !== 'session expired' ? error.message : t('error.sessionExpired');
    case 'client':
    default:
      return error.message || t('error.generic');
  }
}

/**
 * The sentence `describeError` gives, unless it would pass the server's own words through (English, or not words
 * at all, like "request failed (409)"), in which case the caller's fallback is used. For screens that must stay
 * in the reader's language: sign-in, username, rewards.
 */
export function describeErrorOr(error: ApiError, t: Translate, fallback: TranslationKey): string {
  const said = describeError(error, t);
  return said === error.message ? t(fallback) : said;
}

/** Was this call refused because of maintenance? The maintenance screen already says so, so screens skip their own alert. */
export function isMaintenance(error: ApiError): boolean {
  return error.code === MAINTENANCE_CODE;
}

/** Does this failure look like lost connectivity? Drives the offline banner. */
export function isOffline(error: ApiError): boolean {
  return error.kind === 'network';
}

/** The server was not reached, or failed before it could take the request: what was sent is kept for a retry. */
export function notReached(error: ApiError): boolean {
  return error.kind === 'network' || error.kind === 'server';
}

/** Can the same action be meaningfully retried? */
export function isRetryable(error: ApiError): boolean {
  return error.kind === 'network' || error.kind === 'server' || error.kind === 'rate_limited';
}
