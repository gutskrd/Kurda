import type { ApiError } from '../lib/types';
import type { MessageKey } from '../i18n/en';
import type { useT } from '../i18n/I18nProvider';

/**
 * The letters' own refusals in plain words (api/src/letters/service.ts). The
 * page checks a letter before it is sent, so most of these only come from a
 * second tab or a pen pal who acted first; anything else is said as every
 * screen says it.
 */
const TEXT: Readonly<Record<string, MessageKey>> = {
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

export function letterErrorText(error: ApiError, t: ReturnType<typeof useT>): string | null {
  const key = error.code ? TEXT[error.code] : undefined;
  return key ? t(key) : null;
}
