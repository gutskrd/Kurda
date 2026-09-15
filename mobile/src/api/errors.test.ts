import { describe, expect, it } from 'vitest';
import type { ApiError } from './types';
import { describeError, isOffline, isRetryable } from './errors';
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
