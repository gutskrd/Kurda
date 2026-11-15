import { NOTES_MAX, NOTE_MAX, decorErrorCode, type DecorProblem } from '@kurda/shared';
import type { ApiError } from '../api/types';
import type { Translate } from '../api/errors';
import type { TranslationKey } from '../i18n/translations';

/**
 * The letters' own refusals in plain words (api/src/letters/service.ts), as
 * the website says them (web/src/letters/errors.ts). The screen checks a
 * letter before it is sent, its paper and drawing and notes too, so most of
 * these only come from another device or a pen pal who acted first; anything
 * else is said as every screen says it.
 */

/** What to tell the writer about a paper, drawing or notes that cannot go as they are (the composer keeps most of these from happening at all). */
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
  // the decor's refusals, by the codes the server names them with (shared decorErrorCode)
  ...Object.fromEntries((Object.keys(DECOR_PROBLEM) as DecorProblem[]).map((problem) => [decorErrorCode(problem), DECOR_PROBLEM[problem]])),
};

export function letterErrorText(error: ApiError, t: Translate): string | null {
  const key = error.code ? TEXT[error.code] : undefined;
  return key ? t(key, { max: NOTES_MAX, most: NOTE_MAX }) : null;
}
