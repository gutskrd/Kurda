import { describe, expect, it } from 'vitest';
import { describeUploadFailure, normalizeContentType, readPhotoUpload } from './photoUploadResult';
import { TRANSLATIONS, type TranslationKey } from '../i18n/translations';
import { interpolate } from '../i18n/format';

/** The real catalogue rather than a stub, which would pass while every sentence was missing. */
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
      // Never leaks the raw code or server message; always a real sentence.
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

  it('says why the check refused a photo, by its reason', () => {
    const refused = (reason: string) => JSON.stringify({ code: 'PHOTO_REJECTED', message: 'rejected', reason, reviewId: 'rv1' });
    expect(describeUploadFailure(422, refused('sexual'), t)).toBe(TRANSLATIONS.en['picture.refused.sexual']);
    expect(describeUploadFailure(422, refused('hate'), t, undefined, 'group')).toBe(TRANSLATIONS.en['picture.refused.hate']);
  });

  it('never calls a group’s picture a profile photo', () => {
    expect(describeUploadFailure(422, body('PHOTO_REJECTED'), t)).toBe('That image can’t be used as a profile photo.');
    const group = describeUploadFailure(422, body('PHOTO_REJECTED'), t, undefined, 'group');
    expect(group).toBe('This picture can’t be shared on Hevalo.');
    expect(group).not.toMatch(/profile/i);
  });

  it('falls back to the server message for an unknown code', () => {
    expect(describeUploadFailure(400, JSON.stringify({ code: 'WAT', message: 'specific detail' }), t)).toBe('specific detail');
  });

  it('falls back to a status-based message when the body is not JSON', () => {
    expect(describeUploadFailure(502, '<html>Bad Gateway</html>', t)).toBe(
      interpolate(TRANSLATIONS.en['upload.failedWithStatus'], { status: 502 }),
    );
    // And in another language.
    expect(describeUploadFailure(502, '<html>Bad Gateway</html>', tr('ku'))).toBe(
      interpolate(TRANSLATIONS.ku['upload.failedWithStatus'], { status: 502 }),
    );
  });
});

describe('readPhotoUpload', () => {
  it('shows a cleared photo at once', () => {
    expect(readPhotoUpload(JSON.stringify({ profilePhotoUrl: 'https://cdn.test/me.webp', review: 'clear' }), 'profile')).toEqual({
      ok: true,
      url: 'https://cdn.test/me.webp',
      review: 'clear',
      pending: null,
    });
    // An older server says nothing about a check.
    expect(readPhotoUpload(JSON.stringify({ photoUrl: 'https://cdn.test/g.webp' }), 'group')).toMatchObject({ url: 'https://cdn.test/g.webp', review: 'clear' });
  });

  it('keeps the old photo for others while the new one waits for a person', () => {
    const held = { profilePhotoUrl: 'https://cdn.test/old.webp', review: 'held', profilePhotoPending: { url: 'https://media.test/private/new.webp' } };
    expect(readPhotoUpload(JSON.stringify(held), 'profile')).toEqual({
      ok: true,
      url: 'https://cdn.test/old.webp',
      review: 'held',
      pending: { url: 'https://media.test/private/new.webp' },
    });
    // With no photo before, others see the initials meanwhile.
    expect(readPhotoUpload(JSON.stringify({ photoUrl: null, review: 'held', photoPending: { url: 'https://media.test/private/g.webp' } }), 'group')).toEqual({
      ok: true,
      url: null,
      review: 'held',
      pending: { url: 'https://media.test/private/g.webp' },
    });
  });

  it('is nothing when the answer names no photo', () => {
    expect(readPhotoUpload(JSON.stringify({ review: 'clear' }), 'profile')).toBeNull();
    expect(readPhotoUpload('<html>', 'profile')).toBeNull();
  });
});
