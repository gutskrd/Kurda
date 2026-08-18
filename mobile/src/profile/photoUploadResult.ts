/**
 * Pure helpers for the profile-photo upload flow (KUR-177) — no native imports,
 * so they're unit-testable. The network side (expo-file-system) lives in
 * `photoUpload.ts`, which can't be imported under vitest (it drags in react-native).
 */

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
export function describeUploadFailure(status: number, body: string): string {
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
      return "That file isn't a supported image. Please pick a JPEG, PNG, or WebP.";
    case 'MALFORMED_IMAGE':
      return "That image couldn't be read. Please try a different photo.";
    case 'IMAGE_TOO_LARGE':
      return 'That photo is too detailed to fit the size limit. Try a simpler or smaller image.';
    case 'UPLOAD_TOO_LARGE':
      return 'That photo is too large. Please pick a smaller one.';
    case 'PHOTO_REJECTED':
      return "That image can't be used as a profile photo.";
    case 'MEDIA_STORAGE_LIMIT_REACHED':
    case 'MEDIA_OP_LIMIT_REACHED':
    case 'MEDIA_UNAVAILABLE':
      return 'Photo uploads are temporarily unavailable. Please try again later.';
    case 'MEDIA_UPLOAD_FAILED':
      return "The photo couldn't be saved. Please try again.";
    default:
      break;
  }

  if (status === 429) return "You're changing your photo too often. Please wait a moment and try again.";
  if (status === 401) return 'Your session expired. Please sign in again.';
  if (message) return message;
  return `Upload failed (${status}). Please try again.`;
}
