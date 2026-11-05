/**
 * Reading a join code the way people actually hand them over, for the code
 * boxes (play/JoinCode.tsx), and saying in the reader's words why one did not
 * get them in.
 *
 * A code arrives typed one character at a time, pasted as "abc-234" or
 * "ABC 234", typed on an Arabic or Soranî keyboard whose digits are ٢ and ۲,
 * or pasted inside the whole sentence a friend sent ("…type ABC 234."). The
 * boxes only ever hold the six characters themselves, so everything here
 * comes down to those, and anything that cannot be part of a code is dropped
 * rather than refused: a stray space is not worth an error. The server reads
 * what it is sent the same way (`normalizeJoinCode`), so nothing here decides
 * whether a code is good — only what was meant.
 */
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, isMissingRoute } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** The digits an Arabic or a Soranî keyboard types, as the digits they are. */
function foldDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const inAlphabet = (ch: string): boolean => JOIN_CODE_ALPHABET.includes(ch);

/**
 * A code standing on its own in a sentence: three characters of the alphabet,
 * perhaps a space or a dash, three more, and no letter or digit touching
 * either end — so a word like "TYPE" next to the code is never read into it.
 */
const IN_A_SENTENCE = new RegExp(
  String.raw`(?:^|[^A-Z0-9])([${JOIN_CODE_ALPHABET}]{3})[\s-]?([${JOIN_CODE_ALPHABET}]{3})(?![A-Z0-9])`,
  'g',
);

/**
 * What the boxes should hold after this change to the field: at most six
 * characters of the alphabet, upper case. A field holding only code
 * characters, spaces and dashes is the code being typed or pasted; anything
 * longer and wordier is a message with a code in it, and the last code-shaped
 * word in it is the one meant (the message ends with it). Failing both, the
 * characters that could be a code are kept, in order.
 */
export function codeFromTyping(raw: string): string {
  const upper = foldDigits(raw).toUpperCase();
  const bare = upper.replace(/[\s-]/g, '');
  if ([...bare].every(inAlphabet)) return bare.slice(0, JOIN_CODE_LENGTH);
  const found = [...upper.matchAll(IN_A_SENTENCE)].pop();
  if (found) return `${found[1]}${found[2]}`;
  return [...upper].filter(inAlphabet).join('').slice(0, JOIN_CODE_LENGTH);
}

/**
 * Why a code did not get someone in, as the person who typed it can act on:
 * a code nobody is using (or a game they may not join — the server never says
 * which, and neither does this), a full or a started game, too many tries,
 * and otherwise what the app says of any failed request (offline, the server
 * down). A server that has no such route yet is said plainly, as everywhere
 * the play layer meets one.
 */
export function joinCodeError(error: ApiError, t: Translate): string {
  if (isMissingRoute(error)) return t('play.error.notOnServer');
  if (error.kind === 'rate_limited' || error.status === 429) return t('play.join.tooMany');
  switch (error.code) {
    case 'GAME_FULL':
    case 'BATTLE_FULL':
    case 'MATCH_FULL':
      return t('stories.error.full');
    case 'GAME_STARTED':
    case 'NOT_OPEN':
      return t('stories.error.started');
    case 'GAME_NOT_FOUND':
    case 'NOT_FOUND':
      return t('play.join.notFound');
  }
  if (error.status === 404) return t('play.join.notFound');
  return describeError(error, t);
}
