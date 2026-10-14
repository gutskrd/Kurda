/**
 * Pure helpers for the profile-photo upload flow (KUR-177) — no native imports,
 * so they're unit-testable. The network side (expo-file-system) lives in
 * `photoUpload.ts`, which can't be imported under vitest (it drags in react-native).
 */

import type { Translate } from '../api/errors';
import { restrictionOf, restrictionText, standingExplains } from '../reports/sendErrors';

/**
 * `limited`: the upload was refused because of a limit on the account (403
 * MUTED for pictures and voice — a feature limit — or a suspension) whose
 * reasons are on Account standing, so the screen can offer the way there.
 */
export type UploadResult = { ok: true; url: string } | { ok: false; error: string; limited?: boolean };

/** The refusal in an upload's raw response body, as the JSON client would have read it. */
function parseFailure(status: number, body: string): { code?: string; message?: string; details?: unknown } {
  try {
    return JSON.parse(body) as { code?: string; message?: string; details?: unknown };
  } catch {
    // non-JSON body (e.g. a proxy error page) — nothing to read
    return {};
  }
}

/** Was this upload refused by a limit Account standing explains? */
export function uploadWasLimited(status: number, body: string): boolean {
  const { code, details } = parseFailure(status, body);
  const r = restrictionOf({ kind: 'client', status, code, message: '', details });
  return r !== null && standingExplains(r);
}

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
export function describeUploadFailure(status: number, body: string, t: Translate, locale?: string): string {
  const { code, message, details } = parseFailure(status, body);

  // a limit on the account says what it stops and until when (reports/sendErrors.ts)
  const restriction = restrictionOf({ kind: 'client', status, code, message: message ?? '', details });
  if (restriction) return restrictionText(restriction, t, locale);

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
