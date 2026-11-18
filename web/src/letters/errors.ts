import { NOTE_MAX, NOTES_MAX, decorErrorCode, type DecorProblem } from '@kurda/shared';
import type { ApiError } from '../lib/types';
import type { MessageKey } from '../i18n/en';
import type { useT } from '../i18n/I18nProvider';
import { DECOR_PROBLEM } from './paper';

/**
 * The letters' own refusals in plain words (api/src/letters/service.ts). The page checks letters before sending, so
 * most come from a second tab or a pen pal acting first; anything else is described as usual.
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

/** The paper's own refusals (shared decorErrorCode: 'note-contact' comes back as DECOR_NOTE_CONTACT), said as the composer says them. */
const DECOR_TEXT: Readonly<Record<string, MessageKey>> = Object.fromEntries(
  (Object.keys(DECOR_PROBLEM) as DecorProblem[]).map((problem) => [decorErrorCode(problem), DECOR_PROBLEM[problem]]),
);

export function letterErrorText(error: ApiError, t: ReturnType<typeof useT>): string | null {
  const key = error.code ? (TEXT[error.code] ?? DECOR_TEXT[error.code]) : undefined;
  return key ? t(key, { max: error.code === 'DECOR_TOO_MANY_NOTES' ? NOTES_MAX : NOTE_MAX }) : null;
}
