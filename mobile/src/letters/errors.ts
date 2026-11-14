import type { ApiError } from '../api/types';
import type { Translate } from '../api/errors';
import type { TranslationKey } from '../i18n/translations';

/**
 * The letters' own refusals in plain words (api/src/letters/service.ts), as
 * the website says them (web/src/letters/errors.ts). The screen checks a
 * letter before it is sent, so most of these only come from another device or
 * a pen pal who acted first; anything else is said as every screen says it.
 */
const TEXT: Readonly<Record<string, TranslationKey>> = {
  BIRD_OUT: 'letters.error.birdOut',
  PEN_PALS_FULL: 'letters.error.full',
  NOT_YOUR_TURN: 'letters.error.notYourTurn',
  LETTERS_TODAY: 'letters.error.today',
  LETTERS_ENDED: 'letters.thread.closed',
  LETTERS_BANDS: 'letters.error.bands',
  LETTER_SHORT: 'letters.problem.short',
  LETTER_LONG: 'letters.problem.long',
  LETTER_LINK: 'letters.problem.link',
  LETTER_CONTACT: 'letters.problem.contact',
  VISITOR_HERE: 'letters.error.visitorHere',
  NO_BIRDS_OUT: 'letters.error.noBirds',
  CALLS_TODAY: 'letters.callsDone',
  NO_VISITOR: 'letters.visitor.gone',
  BIRD_GONE: 'letters.visitor.gone',
};

export function letterErrorText(error: ApiError, t: Translate): string | null {
  const key = error.code ? TEXT[error.code] : undefined;
  return key ? t(key) : null;
}
