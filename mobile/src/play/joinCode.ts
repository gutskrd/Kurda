/**
 * Join codes without React Native: reading a code from typed or pasted text, explaining refusals, the share message,
 * and each game's code colours. Pure, so each rule is tested alone; CodeTicket.tsx and JoinByCode.tsx draw them.
 *
 * A code is six characters from `JOIN_CODE_ALPHABET` (no 0/O, no 1/I/L) for every game, and the server normalises
 * it (`normalizeJoinCode`); these rules only shape what the boxes show while typing.
 */
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH, hueSteps, playGameHue, type PlayGame } from '@kurda/shared';
import { describeError, type Translate } from '../api/errors';
import type { ApiError } from '../api/types';
import { AA_NORMAL, contrastRatio } from '../a11y/contrast';
import { ensureContrast } from '../a11y/ensureContrast';
import type { Palette } from '../theme/palette';
import { blend, lipOf, type TileTone } from '../theme/tileTones';

/** Converts Arabic-script digits to Western ones. */
function westernDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

// A code in capitals inside other text ("… and type ABC 234"), with at most a space or dash between its halves and
// no letter or digit touching it.
const CODE_IN_TEXT = new RegExp(`(?:^|[^A-Za-z0-9])([${JOIN_CODE_ALPHABET}]{3})[ -]?([${JOIN_CODE_ALPHABET}]{3})(?![A-Za-z0-9])`, 'g');

/**
 * What the boxes hold for the field's text: upper-cased, Arabic-script digits converted, and anything a code cannot
 * contain dropped. Pasted with surrounding words, the code within is taken rather than the first six capitals.
 * Never longer than a code.
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

/** "A B C 2 3 4", so a screen reader spells the code rather than reading it as a word. */
export function spelledCode(code: string): string {
  return code.split('').join(' ');
}

/**
 * A join refusal in words that say what to do next. The server says only "no open game has this code" for every
 * game the person may not join, so this does too.
 */
export function joinCodeError(error: ApiError, t: Translate): string {
  if (error.code === 'GAME_NOT_FOUND') return t('play.join.notFound');
  if (error.code === 'GAME_FULL') return t('stories.join.full');
  if (error.code === 'GAME_STARTED') return t('stories.join.started');
  // Ten tries a minute; a seconds countdown would only invite counting down.
  if (error.kind === 'rate_limited' || error.status === 429) return t('play.join.tooMany');
  return describeError(error, t);
}

/** Where a friend finds the code boxes, "Games → Join with a code", in the app's own words; the arrow follows the reading direction. */
export function codePath(t: Translate, rtl: boolean): string {
  return `${t('learn.view.games')} ${rtl ? '←' : '→'} ${t('stories.join.open')}`;
}

/**
 * The share sheet's message: the game, where to type the code, and the code spelled out, then on its own last line
 * the code's link (shared join-link.ts) when there is one. The sentence still works where a link cannot go, and the
 * link opens a page that explains and joins the game.
 */
export function shareMessage(
  { game, code, storyTitle, link }: { game: string; code: string; storyTitle?: string; link?: string | null },
  t: Translate,
  rtl: boolean,
  format: (code: string) => string,
): string {
  const vars = { code: format(code), path: codePath(t, rtl) };
  const said = storyTitle ? t('play.code.shareStory', { ...vars, title: storyTitle }) : t('play.code.shareText', { ...vars, game });
  return link ? `${said}\n${t('play.code.shareTap')} ${link}` : said;
}

/**
 * Each game's colour: the hue of its stamp on the games page (shared art/games.ts), or the app's violet for story
 * games, which have no stamp. By day, halfway from the base to its deep shade under white text; by night, its
 * lifted base under dark text, as the violet is.
 */
export function gameColour(colors: Palette, game: PlayGame): string {
  const hue = playGameHue(game);
  if (!hue) return colors.primary;
  const steps = hueSteps(colors.scheme, hue);
  return colors.scheme === 'dark' ? steps.base : blend(steps.deep, steps.base, DAY_DEPTH);
}

/** How far toward its deep shade a game's colour sits by day: halfway, where white text clears 5:1 on every game. */
const DAY_DEPTH = 0.5;

/**
 * A code tile in its game's colour: the face, a lip a step darker, and whichever palette ink reads better, nudged
 * until it clears 4.5:1 (which a game colour already does).
 */
export function codeTone(colors: Palette, game: PlayGame): TileTone {
  return filledTone(colors, gameColour(colors, game));
}

/** Any face in a palette colour, inked the same way: a code tile, or a ticket's stub (Ticket.tsx). */
export function filledTone(colors: Palette, face: string): TileTone {
  const inks = [colors.textOnPrimary, colors.textPrimary];
  const best = inks.reduce((a, b) => (contrastRatio(b, face) > contrastRatio(a, face) ? b : a));
  return { face, edge: face, lip: lipOf(face, colors), ink: ensureContrast(best, face, AA_NORMAL) };
}
