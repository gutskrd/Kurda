/**
 * Pure helpers for the profile-photo upload, unit-testable without native imports; the network side (expo-file-system)
 * is `photoUpload.ts`, which cannot load under vitest.
 */

import type { PendingPicture, PictureRejection, PictureReviewState } from '@kurda/shared';
import type { Translate } from '../api/errors';
import { REFUSAL_KEY, pendingOf, rejectionInBody, reviewStateOf } from '../pictures/review';
import { restrictionOf, restrictionText, standingExplains } from '../reports/sendErrors';

/** Whose photo an upload is: the account's own, or a group's. */
export type PhotoKind = 'profile' | 'group';

/**
 * `url` is the photo others see: the new one, or while the new one is `held` for a person, the old one (null when there
 * was none), with the new one in `pending` for its owner. `limited`: refused because of a limit on the account (403
 * MUTED for pictures and voice, or a suspension) whose reasons are on Account standing, so the screen can offer the way
 * there. `rejection`: refused by the picture check, with why and whether a person can be asked to look.
 */
export type UploadResult =
  | { ok: true; url: string | null; review: PictureReviewState; pending: PendingPicture | null }
  | { ok: false; error: string; limited?: boolean; rejection?: PictureRejection };

const PHOTO_FIELDS: Record<PhotoKind, { url: string; pending: string }> = {
  profile: { url: 'profilePhotoUrl', pending: 'profilePhotoPending' },
  group: { url: 'photoUrl', pending: 'photoPending' },
};

/** A successful upload's body, or null when it names no photo to show (shown, or waiting for a person). */
export function readPhotoUpload(body: string, kind: PhotoKind): Extract<UploadResult, { ok: true }> | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
  const field = PHOTO_FIELDS[kind];
  const url = typeof parsed[field.url] === 'string' && parsed[field.url] ? (parsed[field.url] as string) : null;
  const review = reviewStateOf(parsed);
  if (review === 'held') return { ok: true, url, review, pending: pendingOf(parsed[field.pending]) };
  return url ? { ok: true, url, review, pending: null } : null;
}

/** The refusal in an upload's raw response body, as the JSON client would have read it. */
function parseFailure(status: number, body: string): { code?: string; message?: string; details?: unknown } {
  try {
    return JSON.parse(body) as { code?: string; message?: string; details?: unknown };
  } catch {
    // Non-JSON body (a proxy's error page): nothing to read.
    return {};
  }
}

/** Whether this upload was refused by a limit Account standing explains. */
export function uploadWasLimited(status: number, body: string): boolean {
  const { code, details } = parseFailure(status, body);
  const r = restrictionOf({ kind: 'client', status, code, message: '', details });
  return r !== null && standingExplains(r);
}

/**
 * Content types the API's body parser routes to the image handler. Anything else (iOS HEIC) is sent as octet-stream for
 * the server to sniff; an unlisted declared type would be refused 415 before the handler runs.
 */
const ACCEPTED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function normalizeContentType(declared: string | undefined): string {
  return declared && ACCEPTED_CONTENT_TYPES.has(declared) ? declared : 'application/octet-stream';
}

/**
 * A friendly message for a failed profile- or group-photo upload, from the server's error `code`, else the server's
 * message, else a status-based default. Never shows the raw code.
 */
export function describeUploadFailure(status: number, body: string, t: Translate, locale?: string, kind: PhotoKind = 'profile'): string {
  const { code, message, details } = parseFailure(status, body);

  // A limit on the account says what it stops and until when (reports/sendErrors.ts).
  const restriction = restrictionOf({ kind: 'client', status, code, message: message ?? '', details });
  if (restriction) return restrictionText(restriction, t, locale);

  // A refused picture says why (pictures/review.ts).
  const rejection = rejectionInBody(status, body);
  if (rejection) return t(REFUSAL_KEY[rejection.reason]);

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
      // An older server's refusal, without a reason: a group's picture is not a profile photo.
      return kind === 'group' ? t(REFUSAL_KEY.other) : t('upload.photoRejected');
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
  // The server's own message, more specific than anything generic, though still English.
  if (message) return message;
  return t('upload.failedWithStatus', { status });
}
