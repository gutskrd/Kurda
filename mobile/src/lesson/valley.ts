/**
 * The lesson's look, the painted valley: warm paper with pale hills along the top, answers on cream cards with a
 * darker edge, pomegranate red for what is chosen and green for what is right, by day and at dusk.
 *
 * Pure data, so valley.test.ts can hold every text and ground pair to 4.5:1. Where a design colour is too pale for
 * text, the text takes a step darker and the fill keeps the colour. The player lays it over the app's palette while
 * open (`ValleyScope`), so anything drawn inside a lesson uses the same paper and ink, and tiles use `valleyTile`.
 */
import type { ColorScheme } from '../theme/appearance';
import { DARK, LIGHT, type Palette } from '../theme/palette';
import type { TileButtonTone, TileState, TileTone } from '../theme/tileTones';

/** The lesson cards' shape: radius 16 (between the app's 12 and 18) on a 1.5-point hairline, for answers, bubbles, fields and bar edges. */
export const CARD = { radius: 16, edge: 1.5 } as const;

/** A button's face, the darker edge it stands on, and its text. */
interface Fill {
  face: string;
  lip: string;
  ink: string;
}

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
  /** The pomegranate red as a fill (the bar, a play button, the chosen answer), and what is drawn on it. */
  red: string;
  onRed: string;
  /** Red text, a step darker where the fill would not read on the paper. */
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
  /** Wrong, in the red family rather than grey: the same five. */
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
  /** The hills, far to near; the nearest fades into the paper. */
  hills: readonly [string, string, string];
  /** Behind Hevalo's round portrait: light enough at dusk for his antlers to stand out. */
  portrait: string;
  /** The main button (Check), the verdicts' Continue, and Check while there is nothing to check. */
  buttons: Record<TileButtonTone, Fill>;
  off: { face: string; ink: string };
}

export const VALLEY: Record<ColorScheme, Valley> = {
  light: {
    paper: '#fbf6ec',
    card: '#fffdf8',
    line: '#e7dcc6',
    foot: '#dccdb0',
    ink: '#3d2a1f',
    // The design's #7b6a58 a shade deeper, so it also clears 4.5:1 on the sandy track.
    muted: '#74624f',
    red: '#c8483a',
    onRed: '#fffdf8',
    // The red itself is 4.4:1 on the paper; this is 5.2:1, and 4.6:1 on the farthest hill.
    redText: '#b63f31',
    redWash: '#fdf1ec',
    green: '#4f8a3c',
    onGreen: '#fffdf8',
    greenInk: '#2f5f24',
    greenText: '#3f7a32',
    greenWash: '#eef4e3',
    greenLine: '#d4e4bf',
    wrong: '#a8382b',
    onWrong: '#fffdf8',
    wrongInk: '#8f2f22',
    wrongText: '#a8382b',
    wrongWash: '#fdf0ec',
    wrongLine: '#f0d2c8',
    track: '#efe5d2',
    trackShade: '#e3d6bd',
    // The design's #9a8a72 is 2.8:1 on the chip; the muted brown reads at 4.9:1.
    chip: '#f3ead8',
    chipInk: '#74624f',
    bar: '#fffaf1',
    hills: ['#e6e8ee', '#e3ecd2', '#edf2e0'],
    portrait: '#fffaf0',
    buttons: {
      primary: { face: '#3d2a1f', lip: '#24170f', ink: '#fff8ef' },
      // A little deeper than the right-answer green, on which cream text would not clear 4.5:1.
      success: { face: '#467f35', lip: '#2f5a23', ink: '#fff8ef' },
      danger: { face: '#b63f31', lip: '#86291e', ink: '#fff8ef' },
    },
    // Flat, with its text still readable at 4.9:1.
    off: { face: '#efe5d2', ink: '#6f5f50' },
  },
  // The valley at dusk: night paper, cards a step up, and red and green lifted to read on the dark.
  dark: {
    paper: '#1f1a16',
    card: '#2a231d',
    line: '#3d342b',
    foot: '#4b4035',
    ink: '#f1e8d8',
    muted: '#b8a892',
    red: '#e0675a',
    onRed: '#1f1a16',
    redText: '#ee8576',
    redWash: '#3a2622',
    green: '#7fb069',
    onGreen: '#15200f',
    greenInk: '#a8d192',
    greenText: '#8fbd79',
    greenWash: '#232d1d',
    greenLine: '#34452a',
    wrong: '#e8796c',
    onWrong: '#1f1a16',
    wrongInk: '#f0a397',
    wrongText: '#ee8576',
    wrongWash: '#33201c',
    wrongLine: '#4d2c26',
    track: '#352d26',
    trackShade: '#2c251f',
    chip: '#3a3129',
    chipInk: '#c9b9a1',
    bar: '#241e19',
    hills: ['#292730', '#262a20', '#232319'],
    portrait: '#8c7a63',
    buttons: {
      primary: { face: '#f1e8d8', lip: '#a8977f', ink: '#2a1d15' },
      success: { face: '#7fb069', lip: '#57804a', ink: '#15200f' },
      danger: { face: '#e8796c', lip: '#a5463b', ink: '#1f1a16' },
    },
    off: { face: '#322a23', ink: '#b8a892' },
  },
};

/** The app's palette with the valley laid over it, which everything inside a lesson reads its colours from. */
function over(base: Palette, v: Valley): Palette {
  return {
    ...base,
    primary: v.buttons.primary.face,
    accent: v.buttons.primary.face,
    textOnPrimary: v.buttons.primary.ink,
    // The verdicts' text, and the fill of a button from elsewhere in the app that shows one.
    success: v.greenText,
    successFill: v.greenWash,
    danger: v.wrongText,
    dangerFill: v.wrongWash,
    textPrimary: v.ink,
    textSecondary: v.muted,
    background: v.paper,
    gradient: [v.paper, v.paper, v.paper],
    glassFill: v.card,
    glassBorder: v.line,
    separator: v.line,
    controlTrack: v.track,
    selectedFill: v.card,
    surface: v.card,
    surfaceRaised: v.card,
    barFill: v.bar,
  };
}

export const VALLEY_PALETTES: Record<ColorScheme, Palette> = { light: over(LIGHT, VALLEY.light), dark: over(DARK, VALLEY.dark) };

/** The palette Hevalo's round portrait is drawn in: its ground is the portrait's cream, or a lit sand at night for his dark antlers. */
export const PORTRAIT_PALETTES: Record<ColorScheme, Palette> = {
  light: { ...VALLEY_PALETTES.light, controlTrack: VALLEY.light.portrait },
  dark: { ...VALLEY_PALETTES.dark, controlTrack: VALLEY.dark.portrait },
};

/** A tile's colours in the valley by state: cream on its sandy edge, ringed red when chosen, green when right, a deeper red (never grey) when wrong. */
export function valleyTile(v: Valley, state: TileState): TileTone {
  switch (state) {
    case 'picked':
      return { face: v.redWash, edge: v.red, lip: v.red, ink: v.ink };
    case 'right':
      return { face: v.greenWash, edge: v.green, lip: v.green, ink: v.greenInk };
    case 'wrong':
      return { face: v.wrongWash, edge: v.wrong, lip: v.wrong, ink: v.wrongInk };
    case 'spent':
      return { face: v.card, edge: v.line, lip: null, ink: v.muted };
    case 'idle':
    case 'disabled':
      return { face: v.card, edge: v.line, lip: v.foot, ink: v.ink };
  }
}

/** Check and Continue in the valley: dark ink or the verdict's green or red on a darker edge; flat while there is nothing to press. */
export function valleyButton(v: Valley, tone: TileButtonTone, enabled: boolean): TileTone {
  if (!enabled) return { face: v.off.face, edge: v.off.face, lip: null, ink: v.off.ink };
  const { face, lip, ink } = v.buttons[tone];
  return { face, edge: face, lip, ink };
}
