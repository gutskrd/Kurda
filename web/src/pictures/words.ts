import type { PictureRejectReason } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import type { Translate } from '../i18n/I18nProvider';
import type { ApiError } from '../lib/types';

/**
 * Why a picture was refused, in its owner's language (shared picture-review.ts). The server's own message is English
 * and for developers, so it is never shown.
 */
export const REFUSED: Record<PictureRejectReason, MessageKey> = {
  sexual: 'pictureCheck.refused.sexual',
  violence: 'pictureCheck.refused.violence',
  self_harm: 'pictureCheck.refused.selfHarm',
  hate: 'pictureCheck.refused.hate',
  other: 'pictureCheck.refused.other',
};

const REFUSED_CODES: ReadonlySet<string> = new Set(['IMAGE_REJECTED', 'PHOTO_REJECTED']);

/** The sentence for a refused picture, or null for any other error; a refusal that names no reason reads as `other`. */
export function rejectionText(error: ApiError, t: Translate): string | null {
  if (error.rejection) return t(REFUSED[error.rejection.reason]);
  return error.code && REFUSED_CODES.has(error.code) ? t(REFUSED.other) : null;
}
