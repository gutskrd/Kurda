import { NOTES_MAX, NOTE_MAX, decorErrorCode, type DecorProblem } from '@kurda/shared';
import type { ApiError } from '../api/types';
import type { Translate } from '../api/errors';
import type { TranslationKey } from '../i18n/translations';

/**
 * The letters' own refusals in plain words (api/src/letters/service.ts), matching web/src/letters/errors.ts. The
 * composer checks a letter before sending, so most of these only arise from another device or a pen pal acting
 * first.
 */

/** Why a paper, drawing or notes cannot be sent as they are; the composer prevents most of these. */
export const DECOR_PROBLEM: Record<DecorProblem, TranslationKey> = {
  shape: 'letters.paper.full',
  'too-big': 'letters.paper.full',
  'too-many-strokes': 'letters.paper.full',
  'too-many-points': 'letters.paper.full',
  'stroke-width': 'letters.paper.full',
  'off-page': 'letters.paper.full',
  'too-many-notes': 'letters.paper.notesFull',
  'note-empty': 'letters.paper.noteLong',
  'note-long': 'letters.paper.noteLong',
  'note-contact': 'letters.paper.noteContact',
  'note-link': 'letters.paper.noteLink',
  'drawing-not-here': 'letters.paper.drawLocked',
};

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
  // Decor refusals, by the codes the server uses (shared decorErrorCode).
  ...Object.fromEntries((Object.keys(DECOR_PROBLEM) as DecorProblem[]).map((problem) => [decorErrorCode(problem), DECOR_PROBLEM[problem]])),
};

export function letterErrorText(error: ApiError, t: Translate): string | null {
  const key = error.code ? TEXT[error.code] : undefined;
  return key ? t(key, { max: NOTES_MAX, most: NOTE_MAX }) : null;
}
