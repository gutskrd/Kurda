import type { TextSlip } from '@kurda/shared';
import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';
import type { TranslationKey } from '../i18n/translations';
import { restrictionOf, restrictionText } from '../reports/sendErrors';

/**
 * Why a clue or a guess typed in a party game was not taken, in the reader's
 * words, the same sentences the website says (web/src/party/text.ts): the chat
 * pipeline's refusals first (too fast, a word that cannot be said here,
 * blocked by moderation; a mute with its time, as every send path says it),
 * then the game's own (not in this Kurdish's letters, too long, says the word).
 */
export const SLIP_KEY: Record<TextSlip | 'repeat', TranslationKey | null> = {
  empty: null,
  script: 'games.party.slip.script',
  'too-long': 'games.party.slip.tooLong',
  'too-many-words': 'games.party.slip.tooLong',
  repeat: 'games.party.slip.repeat',
};

export function partyTextError(error: ApiError, t: Translate, saysWordKey: TranslationKey, locale?: string): string {
  const restriction = restrictionOf(error);
  if (restriction) return restrictionText(restriction, t, locale);
  switch (error.code) {
    case 'TEXT_NOT_ALLOWED':
    case 'CONTENT_BLOCKED':
      return t('games.party.notAllowed');
    case 'TRUST_VELOCITY':
      return t('games.party.tooFast');
    case 'AUTO_MODERATED':
      return t('games.party.paused');
    case 'TEXT_TOO_LONG':
      return t('games.party.slip.tooLong');
    case 'NOT_YOUR_TURN':
      return t('games.party.notYourTurn');
    case 'MOVE_REFUSED': {
      const reason = (error.details as { reason?: unknown } | undefined)?.reason;
      if (reason === 'says-word') return t(saysWordKey);
      if (reason === 'not-ready') return t('games.party.notReady');
      const key = typeof reason === 'string' && reason in SLIP_KEY ? SLIP_KEY[reason as keyof typeof SLIP_KEY] : null;
      return key ? t(key) : t('games.party.notNow');
    }
    default:
      return describeError(error, t);
  }
}
