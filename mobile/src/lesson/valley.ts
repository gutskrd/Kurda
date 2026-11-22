/**
 * The lesson's colours, taken from Hevalo's own palette (theme/palette.ts): the page and its cards, the ink for what
 * is chosen, a play button and the progress bar, and green and red only for right and wrong, with faint ridges of the
 * page's own colour along the top. Tiles and Check are the app's own (theme/tileTones.ts), so Check wears the one
 * violet. Pure data, so valley.test.ts can hold every text and ground pair to 4.5:1.
 */
import { AA_NORMAL } from '../a11y/contrast';
import { ensureContrast } from '../a11y/ensureContrast';
import type { ColorScheme } from '../theme/appearance';
import { DARK, LIGHT, type Palette } from '../theme/palette';
import { blend } from '../theme/tileTones';

/** The lesson cards' shape, the website's too: radius 16 on a 1.5-point hairline, for bubbles, fields and bar edges. */
export const CARD = { radius: 16, edge: 1.5 } as const;

export interface Valley {
  /** The page. */
  paper: string;
  /** A card on it: an answer, the speech bubble, a field. */
  card: string;
  /** A card's edge all round, and the darker one along its foot. */
  line: string;
  foot: string;
  ink: string;
  /** Secondary text: a hint, a meaning, a label. */
  muted: string;
  /** The ink as a fill (the bar, a play button, the chosen answer), and what is drawn on it. */
  red: string;
  onRed: string;
  /** The lesson's name over the question: the quiet secondary ink. */
  redText: string;
  /** Behind a chosen answer. */
  redWash: string;
  /** Right: its edge and mark, its text on a card, the verdict's text, their wash, and the bar's top line. */
  green: string;
  onGreen: string;
  greenInk: string;
  greenText: string;
  greenWash: string;
  greenLine: string;
  /** Wrong, in the red: the same five. */
  wrong: string;
  onWrong: string;
  wrongInk: string;
  wrongText: string;
  wrongWash: string;
  wrongLine: string;
  /** The progress bar's track, and the shade along its top. */
  track: string;
  trackShade: string;
  /** An answer's round number. */
  chip: string;
  chipInk: string;
  /** The bar at the foot, under the answers. */
  bar: string;
  /** The ridges, far to near: the page's ink faintly over the page, the nearest fading into it. */
  hills: readonly [string, string, string];
  /** Behind Hevalo's round portrait: a step off the page, so his antlers stand out by night too. */
  portrait: string;
}

/** The lesson's colours in `p`, Hevalo's palette for one scheme. */
export function valleyFor(p: Palette): Valley {
  const dark = p.scheme === 'dark';
  const readable = (ink: string, ground: string): string => ensureContrast(ink, ground, AA_NORMAL);
  const line = blend(p.textPrimary, p.surface, dark ? 0.16 : 0.13);
  const greenWash = blend(p.successFill, p.background);
  const wrongWash = blend(p.dangerFill, p.background);
  const track = blend(p.controlTrack, p.background);
  const chip = blend(p.controlTrack, p.surface);
  return {
    paper: p.background,
    card: p.surface,
    line,
    foot: blend('#000000', line, dark ? 0.3 : 0.15),
    ink: p.textPrimary,
    muted: p.textSecondary,
    red: p.primary,
    onRed: p.textOnPrimary,
    redText: p.textSecondary,
    redWash: blend(p.primary, p.surface, 0.07),
    green: p.success,
    onGreen: readable(p.textOnPrimary, p.success),
    greenInk: readable(p.success, greenWash),
    greenText: readable(p.success, greenWash),
    greenWash,
    greenLine: blend(p.success, p.background, 0.4),
    wrong: p.danger,
    onWrong: readable(p.textOnPrimary, p.danger),
    wrongInk: readable(p.danger, wrongWash),
    wrongText: readable(p.danger, wrongWash),
    wrongWash,
    wrongLine: blend(p.danger, p.background, 0.4),
    track,
    trackShade: track,
    chip,
    chipInk: readable(p.textSecondary, chip),
    bar: p.background,
    hills: [blend(p.textPrimary, p.background, dark ? 0.07 : 0.06), blend(p.textPrimary, p.background, 0.045), blend(p.textPrimary, p.background, 0.025)],
    portrait: blend(p.textPrimary, p.background, 0.16),
  };
}

export const VALLEY: Record<ColorScheme, Valley> = { light: valleyFor(LIGHT), dark: valleyFor(DARK) };

/** The palette Hevalo's round portrait is drawn in: its ground is the portrait's, a step off the page. */
export const PORTRAIT_PALETTES: Record<ColorScheme, Palette> = {
  light: { ...LIGHT, controlTrack: VALLEY.light.portrait },
  dark: { ...DARK, controlTrack: VALLEY.dark.portrait },
};
