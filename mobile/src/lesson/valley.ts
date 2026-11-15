/**
 * The lesson's look: the painted valley.
 *
 * A lesson is set on warm paper with a low line of pale hills behind the top
 * of the screen, its answers on cream cards standing on a darker edge, the
 * pomegranate's red for what is chosen and the valley's green for what is
 * right. By day and at dusk, in the scheme the reader has the app in.
 *
 * Pure data, with no React Native in it, so that every pair of words and the
 * ground they are written on can be held to 4.5:1 by its test (valley.test.ts).
 * Where the owner's colour is too pale to write in (the red on the paper, the
 * green behind cream words), the words take a step darker one and the fill
 * keeps the colour.
 *
 * The lesson player lays it over the app's own palette for as long as it is
 * open (`ValleyScope`), so whatever else is drawn inside the lesson — a sheet,
 * the key bar, a button from elsewhere in the app — is on the same paper in the
 * same ink, and its tiles take the valley's colours (`valleyTile`).
 */
import type { ColorScheme } from '../theme/appearance';
import { DARK, LIGHT, type Palette } from '../theme/palette';
import type { TileButtonTone, TileState, TileTone } from '../theme/tileTones';

/**
 * The shape of the lesson's cards, beside their colours: 16 round, the
 * approved look's corner, between the app's 12 and 18, on a 1.5-point
 * hairline — an answer, the speech bubble, a field, the bars' top edges.
 */
export const CARD = { radius: 16, edge: 1.5 } as const;

/** A button's face, the darker edge it stands on, and its words. */
interface Fill {
  face: string;
  lip: string;
  ink: string;
}

export interface Valley {
  /** the page */
  paper: string;
  /** a card on it: an answer, the speech bubble, a field to type in */
  card: string;
  /** a card's edge all round, and the darker one along its foot that it stands on */
  line: string;
  foot: string;
  ink: string;
  /** what is secondary: a hint, a meaning, a label */
  muted: string;
  /** the pomegranate, as a fill: the bar, a play button, what is chosen; and what is drawn on it */
  red: string;
  onRed: string;
  /** red words, a step darker than the fill where the fill would not read on the paper */
  redText: string;
  /** behind an answer that is chosen */
  redWash: string;
  /** right: its edge and mark, its words on a card, the verdict's words, the wash behind both, and the bar's top line */
  green: string;
  onGreen: string;
  greenInk: string;
  greenText: string;
  greenWash: string;
  greenLine: string;
  /** wrong, in the red family rather than in grey: the same five */
  wrong: string;
  onWrong: string;
  wrongInk: string;
  wrongText: string;
  wrongWash: string;
  wrongLine: string;
  /** the progress bar's track, and the shade along its top */
  track: string;
  trackShade: string;
  /** an answer's round number */
  chip: string;
  chipInk: string;
  /** the bar at the foot, under the answers */
  bar: string;
  /** the hills, far to near: the nearest fades into the paper at its foot */
  hills: readonly [string, string, string];
  /** behind Hevalo in his round portrait: light enough at dusk for his antlers to stand out against */
  portrait: string;
  /** the main button (Check), the verdicts' Continue, and Check while there is nothing to check */
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
    // the owner's #7b6a58 a shade deeper, so it also clears 4.5:1 on the sandy track (an offline note, the results' mistakes)
    muted: '#74624f',
    red: '#c8483a',
    onRed: '#fffdf8',
    // the red itself is 4.4:1 on the paper; this is 5.2:1, and 4.6:1 on the farthest hill
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
    // the owner's #9a8a72 is 2.8:1 on the chip; the muted brown reads on it at 4.9:1
    chip: '#f3ead8',
    chipInk: '#74624f',
    bar: '#fffaf1',
    hills: ['#e6e8ee', '#e3ecd2', '#edf2e0'],
    portrait: '#fffaf0',
    buttons: {
      primary: { face: '#3d2a1f', lip: '#24170f', ink: '#fff8ef' },
      // a little deeper than the right answer's green, which cream words on it would not clear 4.5:1 on
      success: { face: '#467f35', lip: '#2f5a23', ink: '#fff8ef' },
      danger: { face: '#b63f31', lip: '#86291e', ink: '#fff8ef' },
    },
    // flat, and its word still readable: 4.9:1
    off: { face: '#efe5d2', ink: '#6f5f50' },
  },
  // the same valley at dusk: night paper, the cards a step up from it, the red and the green lit to read on the dark
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

/** The app's palette with the valley laid over it: what everything inside a lesson reads its colours from. */
function over(base: Palette, v: Valley): Palette {
  return {
    ...base,
    primary: v.buttons.primary.face,
    accent: v.buttons.primary.face,
    textOnPrimary: v.buttons.primary.ink,
    // the verdicts' words, and what a button from elsewhere in the app is filled with when it says one
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

/**
 * The palette Hevalo's round portrait is drawn in: a head-and-shoulders
 * picture stands on the palette's track, and in the portrait that ground is
 * its own cream, or by night a lit sand his dark antlers show against.
 */
export const PORTRAIT_PALETTES: Record<ColorScheme, Palette> = {
  light: { ...VALLEY_PALETTES.light, controlTrack: VALLEY.light.portrait },
  dark: { ...VALLEY_PALETTES.dark, controlTrack: VALLEY.dark.portrait },
};

/**
 * A tile's colours in the valley, by its state: cream on its sandy edge while
 * it waits, the pomegranate's red round it when chosen, green when right, and
 * a deeper red, never grey, when wrong.
 */
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

/** Check and Continue in the valley: dark ink, or the verdict's green or red, on a darker edge; flat while there is nothing to press. */
export function valleyButton(v: Valley, tone: TileButtonTone, enabled: boolean): TileTone {
  if (!enabled) return { face: v.off.face, edge: v.off.face, lip: null, ink: v.off.ink };
  const { face, lip, ink } = v.buttons[tone];
  return { face, edge: face, lip, ink };
}
