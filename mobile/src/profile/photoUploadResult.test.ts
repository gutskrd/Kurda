import { describe, expect, it } from 'vitest';
import { describeUploadFailure, normalizeContentType } from './photoUploadResult';

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
      const msg = describeUploadFailure(status, body(code));
      // never leaks the raw code or server message; always a real sentence
      expect(msg).not.toContain(code);
      expect(msg).not.toContain('server message');
      expect(msg.length).toBeGreaterThan(10);
      expect(msg.endsWith('.')).toBe(true);
    }
  });

  it('groups capacity limits into one "try later" message (no cost details leaked)', () => {
    const storage = describeUploadFailure(507, body('MEDIA_STORAGE_LIMIT_REACHED'));
    const op = describeUploadFailure(503, body('MEDIA_OP_LIMIT_REACHED'));
    expect(storage).toBe(op);
    expect(storage.toLowerCase()).toContain('later');
  });

  it('explains rate-limiting on a 429 even without a body code', () => {
    expect(describeUploadFailure(429, '').toLowerCase()).toContain('wait');
  });

  it('prompts re-auth on 401', () => {
    expect(describeUploadFailure(401, '').toLowerCase()).toContain('sign in');
  });

  it('falls back to the server message for an unknown code', () => {
    expect(describeUploadFailure(400, JSON.stringify({ code: 'WAT', message: 'specific detail' }))).toBe('specific detail');
  });

  it('falls back to a status-based message when the body is not JSON', () => {
    expect(describeUploadFailure(502, '<html>Bad Gateway</html>')).toBe('Upload failed (502). Please try again.');
  });
});
