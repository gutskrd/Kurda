import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';
import type { TranslationKey } from '../i18n/translations';

/**
 * What to say when a post or one of its pictures is refused.
 *
 * The API answers with codes (`@kurda/shared` POST_ERROR_CODES, and the
 * upload pipeline's own), and its messages are English. Each code the
 * composer can meet gets a sentence in the reader's language that says what
 * to do next; anything else falls back to the app's general wording.
 */

const POST_COPY: Record<string, TranslationKey> = {
  EMPTY_POST: 'composer.error.empty',
  TITLE_REQUIRED: 'composer.error.titleRequired',
  TOO_LONG: 'composer.error.tooLong',
  TOO_MANY_PICTURES: 'composer.error.tooManyPictures',
  MEME_NEEDS_PICTURE: 'composer.error.memeNeedsPicture',
  INVALID_MEDIA: 'composer.error.pictureUnusable',
  MEDIA_IN_USE: 'composer.error.pictureInUse',
  TRUST_VELOCITY: 'composer.error.slowDown',
  AUTO_MODERATED: 'composer.error.paused',
  MUTED: 'composer.error.paused',
  SUSPENDED: 'composer.error.paused',
};

export function describePostError(error: ApiError, t: Translate): string {
  const key = error.code ? POST_COPY[error.code] : undefined;
  return key ? t(key) : describeError(error, t);
}

const PICTURE_COPY: Record<string, TranslationKey> = {
  INVALID_IMAGE: 'composer.picture.notImage',
  HEIC_UNSUPPORTED: 'composer.picture.notImage',
  EMPTY_UPLOAD: 'composer.picture.unreadable',
  MALFORMED_IMAGE: 'composer.picture.unreadable',
  IMAGE_TOO_LARGE: 'composer.picture.tooLarge',
  UPLOAD_TOO_LARGE: 'composer.picture.tooLarge',
  IMAGE_REJECTED: 'composer.picture.rejected',
  MEDIA_UNAVAILABLE: 'picture.storageOff',
  MEDIA_STORAGE_LIMIT_REACHED: 'composer.picture.later',
  MEDIA_OP_LIMIT_REACHED: 'composer.picture.later',
  MEDIA_UPLOAD_FAILED: 'composer.picture.later',
  MUTED: 'composer.error.paused',
  SUSPENDED: 'composer.error.paused',
};

/** A failed upload, from its status and the body the server sent. */
export function describePictureFailure(status: number, body: string, t: Translate): string {
  let code: string | undefined;
  try {
    code = (JSON.parse(body) as { code?: string }).code;
  } catch {
    // not JSON (a proxy's error page): the status decides
  }
  const key = code ? PICTURE_COPY[code] : undefined;
  if (key) return t(key);
  if (status === 429) return t('composer.picture.tooMany');
  if (status === 401) return t('upload.sessionExpired');
  return t('picture.uploadFailed');
}
