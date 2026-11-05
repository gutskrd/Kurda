import type { TextSlip } from '@kurda/shared';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Why a clue or a guess typed in a party game was not taken, in the reader's
 * words: the chat pipeline's refusals (the same as a message's — too fast, a
 * word that cannot be said here, blocked by moderation, a mute), then the
 * game's own (not in this Kurdish's letters, too long, says the word). A mute
 * and a restriction are said by `describeError`, with their time, as on every
 * other send path.
 */
export const SLIP_KEY: Record<TextSlip | 'repeat', MessageKey | null> = {
  empty: null,
  script: 'games.party.slip.script',
  'too-long': 'games.party.slip.tooLong',
  'too-many-words': 'games.party.slip.tooLong',
  repeat: 'games.party.slip.repeat',
};

export function partyTextError(error: ApiError, t: Translate, saysWordKey: MessageKey): string {
  switch (error.code) {
    case 'TEXT_NOT_ALLOWED':
      return t('games.party.notAllowed');
    case 'CONTENT_BLOCKED':
      return t('chat.error.blocked');
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
