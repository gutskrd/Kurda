/**
 * Pure helpers for the profile-photo upload flow (KUR-177) — no native imports,
 * so they're unit-testable. The network side (expo-file-system) lives in
 * `photoUpload.ts`, which can't be imported under vitest (it drags in react-native).
 */

import type { Translate } from '../api/errors';

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

/** Content-types the API's body parser routes to the image handler. Anything else
 *  (e.g. iOS HEIC) is sent as octet-stream — the server sniffs the real bytes, so
 *  the declared type is only a hint and an unlisted one would otherwise 415 at the
 *  parser before the handler ever runs. */
const ACCEPTED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function normalizeContentType(declared: string | undefined): string {
  return declared && ACCEPTED_CONTENT_TYPES.has(declared) ? declared : 'application/octet-stream';
}

/**
 * Friendly, user-facing message for a failed profile-photo upload. Keys off the
 * server's error `code` from `setProfilePhoto`; falls back to the server message,
 * then a status-based default. Never leaks the raw code or internal cost details.
 */
export function describeUploadFailure(status: number, body: string, t: Translate): string {
  let code: string | undefined;
  let message: string | undefined;
  try {
    const parsed = JSON.parse(body) as { code?: string; message?: string };
    code = parsed.code;
    message = parsed.message;
  } catch {
    // non-JSON body (e.g. a proxy error page) — fall through to status defaults
  }

  switch (code) {
    case 'INVALID_IMAGE':
      return t('upload.notSupportedImage');
    case 'MALFORMED_IMAGE':
      return t('upload.unreadableImage');
    case 'IMAGE_TOO_LARGE':
      return t('upload.tooDetailed');
    case 'UPLOAD_TOO_LARGE':
      return t('upload.tooLarge');
    case 'PHOTO_REJECTED':
      return t('upload.photoRejected');
    case 'MEDIA_STORAGE_LIMIT_REACHED':
    case 'MEDIA_OP_LIMIT_REACHED':
    case 'MEDIA_UNAVAILABLE':
      return t('upload.temporarilyUnavailable');
    case 'MEDIA_UPLOAD_FAILED':
      return t('upload.notSaved');
    default:
      break;
  }

  if (status === 429) return t('upload.tooOften');
  if (status === 401) return t('upload.sessionExpired');
  // the server's own message, which is more specific than anything generic —
  // and still English, until the API is given a locale of its own
  if (message) return message;
  return t('upload.failedWithStatus', { status });
}
