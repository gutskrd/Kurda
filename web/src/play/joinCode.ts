/**
 * Reads a join code however it is handed over (typed, pasted as "abc-234" or "ABC 234", with Arabic-script digits, or
 * inside a whole sentence), and words why one failed. Anything that cannot be part of a code is dropped rather than
 * refused. The server normalises the same way (`normalizeJoinCode`), so nothing here judges a code.
 */
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, isMissingRoute } from '@kurda/shared';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import type { Translate } from '../i18n/I18nProvider';

/** Arabic and Soranî keyboard digits as ASCII digits. */
function foldDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const inAlphabet = (ch: string): boolean => JOIN_CODE_ALPHABET.includes(ch);

/** A code standing alone in a sentence: 3 + 3 characters, an optional space or dash, nothing touching either end. */
const IN_A_SENTENCE = new RegExp(
  String.raw`(?:^|[^A-Z0-9])([${JOIN_CODE_ALPHABET}]{3})[\s-]?([${JOIN_CODE_ALPHABET}]{3})(?![A-Z0-9])`,
  'g',
);

/**
 * What the boxes hold after a change: at most six upper-case code characters. Code characters with spaces and dashes are
 * the code itself; a wordier message takes its last code-shaped word; otherwise the code characters, in order.
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
 * Why a code failed, as the person can act on it: unknown (or not theirs to join; the server never says which), full,
 * started, too many tries, or a general request failure. A server without the route is said plainly.
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
