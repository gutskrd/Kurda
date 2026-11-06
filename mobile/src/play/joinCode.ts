/**
 * Join codes on the phone, without React Native: what a field typed into or
 * pasted into holds as a code, what a refusal to join by one means, the words
 * a code is shared with, and the colours a game's code is drawn in. Pure, so
 * each rule is tested on its own; CodeTicket.tsx and JoinByCode.tsx draw them.
 *
 * A code is six characters from `JOIN_CODE_ALPHABET` (no 0/O, no 1/I/L), the
 * same for all three games, and the server reads it however it was typed
 * (`normalizeJoinCode`). These rules are only about what the boxes show while
 * somebody types: the server still has the last word.
 */
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, type PlayGame } from '@kurda/shared';
import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';
import { AA_NORMAL, contrastRatio } from '../a11y/contrast';
import { ensureContrast } from '../a11y/ensureContrast';
import type { Palette } from '../theme/palette';
import { lipOf, type TileTone } from '../theme/tileTones';

/** The digits an Arabic or a Soranî keyboard types, as the digits they are. */
function westernDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// a code written out in capitals inside other words — "… and type ABC 234" —
// with nothing but a space or a dash between its halves, and no letter or digit
// touching it on either side
const CODE_IN_TEXT = new RegExp(`(?:^|[^A-Za-z0-9])([${JOIN_CODE_ALPHABET}]{3})[ -]?([${JOIN_CODE_ALPHABET}]{3})(?![A-Za-z0-9])`, 'g');

/**
 * What the boxes hold for what is in the field.
 *
 * Typed or pasted, it is upper-cased, the digits of an Arabic-script keyboard
 * are read as digits, and anything a code cannot contain is dropped — spaces,
 * dashes, and the look-alikes the alphabet leaves out. Pasted with words round
 * it (the whole message a friend shared), the code in it is what is taken, not
 * the first six capitals of the sentence. Never longer than a code.
 */
export function typedCode(text: string): string {
  const plain = westernDigits(text);
  if (plain.replace(/[\s-]/g, '').length > JOIN_CODE_LENGTH) {
    const found = [...plain.matchAll(CODE_IN_TEXT)].pop();
    if (found) return `${found[1]}${found[2]}`;
  }
  return [...plain.toUpperCase()]
    .filter((ch) => JOIN_CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, JOIN_CODE_LENGTH);
}

/** "A B C 2 3 4", so a screen reader spells the code instead of reading it as a word. */
export function spelledCode(code: string): string {
  return code.split('').join(' ');
}

/**
 * What a refusal to join by code means, in words that say what to do next.
 * The server says no more than "no open game has this code" for every game the
 * person may not join, so neither does this.
 */
export function joinCodeError(error: ApiError, t: Translate): string {
  if (error.code === 'GAME_NOT_FOUND') return t('play.join.notFound');
  if (error.code === 'GAME_FULL') return t('stories.join.full');
  if (error.code === 'GAME_STARTED') return t('stories.join.started');
  // ten tries a minute: a countdown in seconds would only invite counting down
  if (error.kind === 'rate_limited' || error.status === 429) return t('play.join.tooMany');
  return describeError(error, t);
}

/**
 * Where a friend finds the boxes, in the app's own words for both steps —
 * "Games → Join with a code" — so the message and the hint cannot name a
 * place by a word the screen does not use. The arrow points the way the
 * language reads.
 */
export function codePath(t: Translate, rtl: boolean): string {
  return `${t('learn.view.games')} ${rtl ? '←' : '→'} ${t('stories.join.open')}`;
}

/**
 * The message the share sheet sends: the game, where to type the code, and the
 * code as it is read out. No link: a code works in whichever app the friend
 * opens, and anywhere a link could not go — said aloud, written on a board.
 */
export function shareMessage(
  { game, code, storyTitle }: { game: string; code: string; storyTitle?: string },
  t: Translate,
  rtl: boolean,
  format: (code: string) => string,
): string {
  const vars = { code: format(code), path: codePath(t, rtl) };
  return storyTitle ? t('play.code.shareStory', { ...vars, title: storyTitle }) : t('play.code.shareText', { ...vars, game });
}

/**
 * Each game's own colour, from the palette as it stands: Peyvok Battle's is
 * the green of a letter in the right place, Rhyme Match's the sun's gold, a
 * story's the ink of the page it is read on.
 */
const GAME_COLOUR: Record<PlayGame, 'success' | 'gold' | 'primary'> = {
  'wordle-battle': 'success',
  'rhyme-match': 'gold',
  stories: 'primary',
  'last-letter': 'primary',
  impostor: 'gold',
  'dont-say': 'gold',
  bluff: 'success',
  'who-am-i': 'gold',
};

export function gameColour(colors: Palette, game: PlayGame): string {
  return colors[GAME_COLOUR[game]];
}

/**
 * A code's tile in its game's colour: the face filled with it, on a lip a step
 * darker, and the letters in whichever of the palette's two inks reads better
 * on it — then nudged until they clear 4.5:1, so a gold tile in the light
 * theme gets dark letters and a green one white.
 */
export function codeTone(colors: Palette, game: PlayGame): TileTone {
  return filledTone(colors, gameColour(colors, game));
}

/**
 * Any face filled with one of the palette's colours, inked the same way: a
 * code's tile in its game's colour, or a ticket's stub (Ticket.tsx) in the
 * colour of what it is for.
 */
export function filledTone(colors: Palette, face: string): TileTone {
  const inks = [colors.textOnPrimary, colors.textPrimary];
  const best = inks.reduce((a, b) => (contrastRatio(b, face) > contrastRatio(a, face) ? b : a));
  return { face, edge: face, lip: lipOf(face, colors), ink: ensureContrast(best, face, AA_NORMAL) };
}
