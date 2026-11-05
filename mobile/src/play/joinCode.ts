/**
 * Join codes on the phone, without React Native: the words a code is shared
 * with and the colours a game's code is drawn in. Pure, so each rule is tested
 * on its own; CodeTicket.tsx draws them.
 *
 * A code is six characters from `JOIN_CODE_ALPHABET` (no 0/O, no 1/I/L), the
 * same for all three games.
 */
import type { PlayGame } from '@kurda/shared';
import type { Translate } from '../api/errors';
import { AA_NORMAL, contrastRatio } from '../a11y/contrast';
import { ensureContrast } from '../a11y/ensureContrast';
import type { Palette } from '../theme/palette';
import { lipOf, type TileTone } from '../theme/tileTones';

/** "A B C 2 3 4", so a screen reader spells the code instead of reading it as a word. */
export function spelledCode(code: string): string {
  return code.split('').join(' ');
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
  const face = gameColour(colors, game);
  const inks = [colors.textOnPrimary, colors.textPrimary];
  const best = inks.reduce((a, b) => (contrastRatio(b, face) > contrastRatio(a, face) ? b : a));
  return { face, edge: face, lip: lipOf(face, colors), ink: ensureContrast(best, face, AA_NORMAL) };
}
