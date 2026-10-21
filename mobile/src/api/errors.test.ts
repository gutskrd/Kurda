import { describe, expect, it } from 'vitest';
import type { ApiError } from './types';
import { CODE_COPY, describeError, isOffline, isRetryable } from './errors';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';

const err = (e: Partial<ApiError> & Pick<ApiError, 'kind'>): ApiError => ({ message: 'raw technical detail', ...e });

/**
 * A real translator over the real catalogue, not a stub.
 *
 * A stub that answers with the key would pass while every sentence was
 * missing — which is the failure this whole module exists to prevent. Reading
 * the catalogue means a key that is not there fails the test.
 */
const translator =
  (locale: 'en' | 'ku') =>
  (key: TranslationKey, vars?: Record<string, string | number>): string => {
    const value = TRANSLATIONS[locale][key];
    expect(value, `missing ${locale} ${key}`).toBeTruthy();
    return interpolate(value, vars);
  };

const t = translator('en');

describe('describeError', () => {
  it('rewrites a network error as an offline message, in the reader’s language', () => {
    expect(describeError(err({ kind: 'network' }), t)).not.toContain('raw technical detail');
    expect(describeError(err({ kind: 'network' }), t)).toBe(TRANSLATIONS.en['error.offline']);
    expect(describeError(err({ kind: 'network' }), translator('ku'))).toBe(TRANSLATIONS.ku['error.offline']);
  });

  it('says plainly when the server does not have something yet, instead of "route not found"', () => {
    // an API older than the app, e.g. a game invite before the play routes are deployed
    const missing = err({ kind: 'client', status: 404, code: 'NOT_FOUND', message: 'route not found' });
    expect(describeError(missing, t)).toBe(TRANSLATIONS.en['error.notOnServer']);
    expect(describeError(missing, translator('ku'))).toBe(TRANSLATIONS.ku['error.notOnServer']);
    // any other NOT_FOUND keeps the server's own words
    expect(describeError({ ...missing, message: 'no such image' }, t)).toBe('no such image');
  });

  it('rewrites a 5xx as an "our end" message rather than the raw one', () => {
    const message = describeError(err({ kind: 'server', status: 500 }), t);
    expect(message).toBe(TRANSLATIONS.en['error.server']);
    expect(message).not.toContain('raw technical detail');
  });

  it('includes the retry-after hint for rate limits, and rounds up', () => {
    expect(describeError(err({ kind: 'rate_limited', retryAfterSec: 30 }), t)).toContain('30');
    expect(describeError(err({ kind: 'rate_limited', retryAfterSec: 0.2 }), t)).toContain('1');
    expect(describeError(err({ kind: 'rate_limited' }), t)).toBe(TRANSLATIONS.en['error.tooMany']);
  });

  it('passes the server message through for client errors', () => {
    expect(describeError(err({ kind: 'client', status: 422, message: 'title and body are required' }), t)).toBe(
      'title and body are required',
    );
  });

  it('passes the server message through for unauthorized (so a bad login is not "session expired")', () => {
    expect(describeError(err({ kind: 'unauthorized', status: 401, message: 'incorrect email or password' }), t)).toBe(
      'incorrect email or password',
    );
  });

  it('falls back to session-expired only when the server says nothing useful', () => {
    expect(describeError(err({ kind: 'unauthorized', message: 'session expired' }), t)).toBe(
      TRANSLATIONS.en['error.sessionExpired'],
    );
  });

  it('falls back to a generic message when the server sends none', () => {
    expect(describeError({ kind: 'client', message: '' }, t)).toBe(TRANSLATIONS.en['error.generic']);
  });

  it('says an unactivated account is an instruction, not a refusal', () => {
    const e = err({ kind: 'client', status: 403, code: 'ACCOUNT_NOT_ACTIVATED' });
    expect(describeError(e, t)).toBe(TRANSLATIONS.en['error.notActivated']);
  });
});

describe('isOffline / isRetryable', () => {
  it('treats only a network failure as offline', () => {
    expect(isOffline(err({ kind: 'network' }))).toBe(true);
    for (const kind of ['server', 'rate_limited', 'client', 'unauthorized'] as const) {
      expect(isOffline(err({ kind }))).toBe(false);
    }
  });

  it('retries the infrastructure kinds and nothing else', () => {
    for (const kind of ['network', 'server', 'rate_limited'] as const) {
      expect(isRetryable(err({ kind }))).toBe(true);
    }
    for (const kind of ['client', 'unauthorized'] as const) {
      expect(isRetryable(err({ kind }))).toBe(false);
    }
  });
});

describe('CODE_COPY', () => {
  /**
   * Every 4xx the API raises carries an English message, and this module's
   * last line handed it straight to the reader — so a wrong password said
   * "invalid email or password" in all nine languages. These are the codes
   * that now answer in the reader's own.
   */
  it('answers every mapped code in both languages, and never with the server\'s English', () => {
    for (const [code, key] of Object.entries(CODE_COPY)) {
      for (const locale of ['en', 'ku'] as const) {
        const said = describeError(err({ kind: 'client', code, status: 400 }), translator(locale));
        expect(said, `${locale} ${code}`).toBe(TRANSLATIONS[locale][key]);
        expect(said, `${locale} ${code} leaked the server message`).not.toBe('raw technical detail');
      }
    }
  });

  it('says a wrong password in Kurmancî, not in the API\'s English', () => {
    const wrong = err({ kind: 'unauthorized', code: 'INVALID_CREDENTIALS', message: 'invalid email or password', status: 401 });
    expect(describeError(wrong, translator('ku'))).toBe(TRANSLATIONS.ku['error.code.invalidCredentials']);
  });

  /**
   * 105 codes are not in the table, and 17 of those carry several different
   * messages apiece, so the code alone cannot say which. The server's own
   * sentence is the honest thing to show for them.
   */
  /*
   * Every refusal the sign-up, sign-in and email-check routes can give
   * (api/src/auth/routes.ts and service.ts), with the details the server
   * sends: none of them may reach the reader as the server's English or as
   * "Something went wrong".
   */
  it('answers every sign-up, sign-in and verification refusal in the reader\'s words', () => {
    const refusals: ApiError[] = [
      err({ kind: 'client', status: 409, code: 'REGISTRATION_FAILED' }),
      err({ kind: 'client', status: 409, code: 'USERNAME_TAKEN' }),
      err({ kind: 'client', status: 400, code: 'SIGNUP_REJECTED' }),
      err({ kind: 'client', status: 400, code: 'INVALID_USERNAME', details: { reason: 'reserved' } }),
      err({ kind: 'client', status: 400, code: 'INVALID_USERNAME', details: { reason: 'too-short' } }),
      err({ kind: 'client', status: 400, code: 'WEAK_PASSWORD', details: { reason: 'needs-number' } }),
      err({ kind: 'client', status: 400, code: 'WEAK_PASSWORD' }),
      err({ kind: 'client', status: 400, code: 'VALIDATION_ERROR' }),
      err({ kind: 'client', status: 400, code: 'VALIDATION_ERROR', details: [{ path: ['email'], message: 'Invalid email address' }] }),
      err({ kind: 'client', status: 400, code: 'INVALID_BIRTH_MONTH' }),
      err({ kind: 'client', status: 403, code: 'UNDER_MINIMUM_AGE' }),
      err({ kind: 'client', status: 401, code: 'INVALID_CREDENTIALS' }),
      err({ kind: 'client', status: 403, code: 'LOGIN_VERIFICATION_REQUIRED' }),
      err({ kind: 'client', status: 403, code: 'ACCOUNT_DISABLED' }),
      err({ kind: 'client', status: 401, code: 'INVALID_OAUTH_TOKEN' }),
      err({ kind: 'server', status: 503, code: 'OAUTH_NOT_CONFIGURED' }),
      err({ kind: 'client', status: 400, code: 'INVALID_TOKEN' }),
      err({ kind: 'client', status: 400, code: 'INVALID_CODE' }),
      err({ kind: 'client', status: 400, code: 'CODE_EXPIRED' }),
      err({ kind: 'rate_limited', status: 429, code: 'TOO_MANY_ATTEMPTS' }),
      err({ kind: 'rate_limited', status: 429, code: 'LOCKED' }),
      err({ kind: 'rate_limited', status: 429, code: 'RATE_LIMITED' }),
      err({ kind: 'client', status: 401, code: 'UNAUTHORIZED' }),
    ];
    for (const locale of ['en', 'ku'] as const) {
      for (const refusal of refusals) {
        const said = describeError(refusal, translator(locale));
        expect(said, `${locale} ${refusal.code}`).not.toBe('raw technical detail');
        expect(said, `${locale} ${refusal.code}`).not.toBe(TRANSLATIONS[locale]['error.generic']);
        expect(said, `${locale} ${refusal.code}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  /*
   * The server will not say whether an address has an account, so neither
   * does the phone: the sentence is the same whether it has one or not, and
   * it names both ways on.
   */
  it('words an address that may already have an account without confirming it', () => {
    const said = describeError(err({ kind: 'client', status: 409, code: 'REGISTRATION_FAILED', message: 'unable to register with these details' }), t);
    expect(said).toBe('We couldn’t create an account with these details. If you already have one, log in or reset your password.');
    expect(said).not.toMatch(/already (registered|in use|exists)/i);
  });

  it('names the broken password or username rule from the reason the server gives', () => {
    expect(describeError(err({ kind: 'client', code: 'WEAK_PASSWORD', details: { reason: 'needs-letter' } }), t)).toBe(
      TRANSLATIONS.en['field.passwordNeedsLetter'],
    );
    expect(describeError(err({ kind: 'client', code: 'INVALID_USERNAME', details: { reason: 'numbers-only' } }), t)).toBe(
      TRANSLATIONS.en['error.code.usernameLetter'],
    );
    expect(describeError(err({ kind: 'client', code: 'INVALID_USERNAME', details: { reason: 'reserved' } }), t)).toBe(
      'That username isn’t available. Try another one.',
    );
    expect(describeError(err({ kind: 'client', code: 'INVALID_USERNAME', details: { reason: 'too-long' } }), t)).toBe('Username must be 3–30 characters (letters, digits or _)');
  });

  it('names the email when that is the field the server could not accept, and asks for another look otherwise', () => {
    expect(describeError(err({ kind: 'client', code: 'VALIDATION_ERROR', details: [{ path: ['email'] }] }), t)).toBe(
      'That email address doesn’t look complete. Check it and try again.',
    );
    expect(describeError(err({ kind: 'client', code: 'VALIDATION_ERROR', details: [{ path: ['username'] }] }), t)).toBe(
      TRANSLATIONS.en['error.code.checkDetails'],
    );
  });

  it('falls through to the server message for a code it does not know', () => {
    expect(describeError(err({ kind: 'client', code: 'BAD_ROSTER', status: 409 }), t)).toBe('raw technical detail');
  });

  /**
   * 792 seconds is what a real lockout came back as, and "try again in 792s"
   * is accurate and unreadable.
   */
  it('counts a long wait in minutes and a short one in seconds', () => {
    const locked = (retryAfterSec: number) => err({ kind: 'rate_limited', code: 'LOCKED', retryAfterSec, status: 429 });
    expect(describeError(locked(792), t)).toBe(
      interpolate(TRANSLATIONS.en['error.tooManyRetryInMin'], { minutes: 14 }),
    );
    expect(describeError(locked(45), t)).toBe(interpolate(TRANSLATIONS.en['error.tooManyRetryIn'], { seconds: 45 }));
  });

  it('prefers a countdown to a sentence when the server sent one', () => {
    const limited = err({ kind: 'rate_limited', code: 'LOCKED', retryAfterSec: 30, status: 429 });
    expect(describeError(limited, t)).toBe(interpolate(TRANSLATIONS.en['error.tooManyRetryIn'], { seconds: 30 }));
  });
});
