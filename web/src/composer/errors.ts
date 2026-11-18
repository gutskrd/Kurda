import type { PostProblem } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import type { Translate } from '../i18n/I18nProvider';
import { describeError } from '../lib/api';
import { restrictionOf, type Restriction } from '../reports/restriction';
import type { ApiError } from '../lib/types';

/** The composer's error codes in the reader's language, since the API's messages are English and for developers. */
const CODE_KEY: Record<string, MessageKey> = {
  // The post.
  EMPTY_POST: 'composer.error.empty',
  TITLE_REQUIRED: 'composer.error.titleRequired',
  TOO_LONG: 'composer.error.tooLong',
  TOO_MANY_PICTURES: 'composer.error.tooManyPictures',
  MEME_NEEDS_PICTURE: 'composer.error.memeNeedsPicture',
  INVALID_MEDIA: 'composer.error.pictureGone',
  MEDIA_IN_USE: 'composer.error.pictureGone',
  TRUST_VELOCITY: 'composer.error.slowDown',
  AUTO_MODERATED: 'composer.error.restricted',
  MUTED: 'composer.error.restricted',
  // A picture's upload.
  UPLOAD_TOO_LARGE: 'composer.upload.tooLarge',
  IMAGE_TOO_LARGE: 'composer.upload.tooLarge',
  HEIC_UNSUPPORTED: 'composer.upload.heic',
  INVALID_IMAGE: 'composer.upload.notPicture',
  MALFORMED_IMAGE: 'composer.upload.notPicture',
  EMPTY_UPLOAD: 'composer.upload.notPicture',
  IMAGE_REJECTED: 'composer.upload.rejected',
  MEDIA_UNAVAILABLE: 'picture.storageOff',
  MEDIA_STORAGE_LIMIT_REACHED: 'composer.upload.paused',
  MEDIA_OP_LIMIT_REACHED: 'composer.upload.paused',
  MEDIA_UPLOAD_FAILED: 'composer.upload.failed',
};

/**
 * An account limit behind a refused post or picture (reports/restriction.ts). A bare MUTED is a group mute, which
 * posts never meet, so it keeps the composer's own words.
 */
export function accountLimitOf(error: ApiError): Restriction | null {
  const restriction = restrictionOf(error);
  return restriction && restriction.kind !== 'groupMuted' ? restriction : null;
}

export function composerErrorText(error: ApiError, t: Translate): string {
  // An account limit says what it stops and until when.
  if (accountLimitOf(error)) return describeError(error, t);
  const key = error.code ? CODE_KEY[error.code] : undefined;
  // A rate limit with a countdown goes to describeError, which shows it.
  if (key && !(error.kind === 'rate_limited' && error.retryAfterSec)) return t(key);
  return describeError(error, t);
}

/** Why the Post button is off, for the line beside it. */
export function problemText(problem: PostProblem, t: Translate): string {
  switch (problem.code) {
    case 'EMPTY_POST':
      return t('composer.error.empty');
    case 'TITLE_REQUIRED':
      return t('composer.error.titleRequired');
    case 'TOO_MANY_PICTURES':
      return t('composer.error.tooManyPictures');
    case 'MEME_NEEDS_PICTURE':
      return t('composer.error.memeNeedsPicture');
    case 'TOO_LONG':
      return problem.field === 'title'
        ? t('composer.tooLong.title', { max: problem.max.toLocaleString() })
        : problem.field === 'altText'
          ? t('composer.tooLong.alt', { max: problem.max.toLocaleString() })
          : problem.field === 'sourceCredit'
            ? t('composer.tooLong.source', { max: problem.max.toLocaleString() })
            : t('composer.tooLong.body', { max: problem.max.toLocaleString() });
  }
}
