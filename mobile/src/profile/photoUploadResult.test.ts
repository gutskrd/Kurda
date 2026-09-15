import { describe, expect, it } from 'vitest';
import { describeUploadFailure, normalizeContentType } from './photoUploadResult';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';

/**
 * The real catalogue rather than a stub: a stub that echoes the key would pass
 * while every sentence was missing, which is the failure this maps against.
 */
const tr =
  (locale: 'en' | 'ku') =>
  (key: TranslationKey, vars?: Record<string, string | number>): string => {
    const value = TRANSLATIONS[locale][key];
    expect(value, `missing ${locale} ${key}`).toBeTruthy();
    return interpolate(value, vars);
  };
const t = tr('en');

describe('normalizeContentType', () => {
  it('passes through the types the API parser accepts', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(normalizeContentType(t)).toBe(t);
    }
  });

  it('routes unlisted or missing types through octet-stream (server sniffs)', () => {
    expect(normalizeContentType('image/heic')).toBe('application/octet-stream');
    expect(normalizeContentType('application/pdf')).toBe('application/octet-stream');
    expect(normalizeContentType(undefined)).toBe('application/octet-stream');
  });
});

const body = (code: string, message = 'server message') => JSON.stringify({ code, message });

describe('describeUploadFailure', () => {
  it('maps each server error code to a friendly, non-technical message', () => {
    const cases: Array<[number, string]> = [
      [415, 'INVALID_IMAGE'],
      [422, 'MALFORMED_IMAGE'],
      [422, 'IMAGE_TOO_LARGE'],
      [413, 'UPLOAD_TOO_LARGE'],
      [422, 'PHOTO_REJECTED'],
      [507, 'MEDIA_STORAGE_LIMIT_REACHED'],
      [503, 'MEDIA_OP_LIMIT_REACHED'],
      [503, 'MEDIA_UNAVAILABLE'],
      [502, 'MEDIA_UPLOAD_FAILED'],
    ];
    for (const [status, code] of cases) {
      const msg = describeUploadFailure(status, body(code), t);
      // never leaks the raw code or server message; always a real sentence
      expect(msg).not.toContain(code);
      expect(msg).not.toContain('server message');
      expect(msg.length).toBeGreaterThan(10);
      expect(msg.endsWith('.')).toBe(true);
    }
  });

  it('groups capacity limits into one "try later" message (no cost details leaked)', () => {
    const storage = describeUploadFailure(507, body('MEDIA_STORAGE_LIMIT_REACHED'), t);
    const op = describeUploadFailure(503, body('MEDIA_OP_LIMIT_REACHED'), t);
    expect(storage).toBe(op);
    expect(storage.toLowerCase()).toContain('later');
  });

  it('explains rate-limiting on a 429 even without a body code', () => {
    expect(describeUploadFailure(429, '', t).toLowerCase()).toContain('wait');
  });

  it('prompts re-auth on 401', () => {
    expect(describeUploadFailure(401, '', t).toLowerCase()).toContain('sign in');
  });

  it('falls back to the server message for an unknown code', () => {
    expect(describeUploadFailure(400, JSON.stringify({ code: 'WAT', message: 'specific detail' }), t)).toBe('specific detail');
  });

  it('falls back to a status-based message when the body is not JSON', () => {
    expect(describeUploadFailure(502, '<html>Bad Gateway</html>', t)).toBe(
      interpolate(TRANSLATIONS.en['upload.failedWithStatus'], { status: 502 }),
    );
    // and in another language, because that is the point of the change
    expect(describeUploadFailure(502, '<html>Bad Gateway</html>', tr('ku'))).toBe(
      interpolate(TRANSLATIONS.ku['upload.failedWithStatus'], { status: 502 }),
    );
  });
});
