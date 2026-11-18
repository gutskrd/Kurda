/**
 * The light and dark palettes. Hevalo's colour is its icon's violet, kept for what can be pressed or is chosen; the
 * page is a faintly violet white with deep indigo ink, so the eye goes to the one violet thing. Gold is for what is
 * earned (XP, Zêr, the streak, medals); green and red mean right and wrong but are never the only signal; anything
 * else needing its own colour uses the shared hues (shared `hues.ts`).
 *
 * By night the page is the indigo taken almost to black, never a neutral grey, with the violet lifted so it does not
 * glare. Components read the active `Palette` from ThemeProvider, and `palette.contrast.test.ts` holds every
 * text-on-surface pair to WCAG AA.
 */
import type { ColorScheme } from './appearance';

export interface Palette {
  scheme: ColorScheme;

  /*
   * The brand: `primary` is the violet (button fills, pressable glyphs, links, what is chosen) and `textPrimary` the
   * ink for everything else, one of each so two buttons are never two colours. `accent` is the violet a step deeper
   * (paler by night) for the few places needing a second tone.
   */
  primary: string;
  accent: string;
  gold: string;
  danger: string;
  success: string;
  successFill: string; // Soft tint behind a "correct" banner.
  dangerFill: string; // Soft tint behind a "wrong" banner.

  // Text.
  textPrimary: string;
  textSecondary: string;
  textOnPrimary: string;
  /**
   * Text or marks on a gold fill (a pill, a podium place, a Peyvok letter in the wrong square). Not `textOnPrimary`,
   * which is white by day and only 2.1:1 on gold. This deep brown clears 4.5:1 on `gold` in both schemes, where the
   * gold is light in both.
   */
  textOnGold: string;

  // The page background, and a three-stop gradient for depth.
  background: string;
  gradient: readonly [string, string, string];

  // Card surfaces.
  glassFill: string; // The card fill; nothing is blurred behind it.
  glassBorder: string; // A subtle hairline edge.

  /** What dims the screen behind something raised over it (the side panel, the action button). */
  scrim: string;
  /**
   * Content on the scrim, such as a spinner over an uploading photo. The scrim is dark in both schemes, so this is
   * light in both, where `textOnPrimary` would turn dark in the dark scheme and vanish.
   */
  textOnScrim: string;

  /** The boundary between two regions of a screen, such as a chat composer or the hairline under a header; never between rows. */
  separator: string;

  /** The border of buttons and tiles. */
  clayBorder: string;
  softShadow: string; // Outer drop-shadow colour.

  controlTrack: string; // Inactive segmented control track.
  /**
   * A switch's track and knob, on and off. On is violet, like everything chosen, not green, which here means a right
   * answer. Each track clears 3:1 on every surface and each knob 3:1 on its track (WCAG 1.4.11), and the knob's side
   * also shows the state. The knob has its own colour on every platform, since iOS's white knob vanished on a white
   * dark-mode track.
   */
  switchOn: string;
  switchOnThumb: string;
  switchOff: string;
  switchOffThumb: string;
  /** The chosen option in a segmented control: a step up from its track. */
  selectedFill: string;

  /**
   * Something not reached yet (a league above yours): its shape in a quiet grey, the keyhole a step darker (lighter in
   * the dark), visible but unlike what is earned. Not a control, so not held to 3:1.
   */
  locked: string;
  lockedMark: string;

  /*
   * The two raised surfaces for things that sit on the page: a card, a tile, a row needing its own ground. Solid
   * rather than translucent, which would look different on every screen; `surfaceRaised` is one step up, for
   * something inside a surface (a chip on a card).
   */
  surface: string;
  surfaceRaised: string;

  /**
   * A conversation's two voices, matching the website's `--bubble-*`: your words white on the violet, the other side's
   * in the page's ink on a quiet neutral. All four are solid, since a bubble's tail is a second shape beside it and two
   * translucent shapes would show their overlap.
   */
  bubbleMine: string;
  bubbleMineInk: string;
  bubbleTheirs: string;
  bubbleTheirsInk: string;

  /**
   * The tab bar's fill, solid: nothing blurs behind it, so any translucency shows content scrolling beneath as a ghost.
   * A hairline along its top separates it from the page.
   */
  barFill: string;

  /*
   * Gold for text, which is not gold for fills. The sun's gold (`gold`) reads as text on the dark page, but is 1.9:1
   * on the light one, so light-mode gold text uses this darker ochre, which clears 4.5:1 on the page and a white card.
   */
  goldText: string;
}

export const LIGHT: Palette = {
  scheme: 'light',
  // The icon's violet, deepened until white reads on it: 6.1:1 under a button's label, 5.6:1 as a link on the page.
  primary: '#862BE2',
  accent: '#611BA7',
  gold: '#EBA905',
  danger: '#C0392B',
  success: '#2E7D32',
  successFill: '#DCF7E1',
  dangerFill: '#FEE9E6',

  // a deep indigo, not black: 16.8:1 on the page, and it sits with the violet where black sat beside it
  textPrimary: '#14112E',
  // 6.3:1 on the page, 6.9:1 on a card and 5.5:1 on the other side's chat bubble.
  textSecondary: '#595870',
  textOnPrimary: '#FFFFFF',
  // 6.8:1 on the gold.
  textOnGold: '#3A2A00',

  // White with a breath of violet, so white cards lift off it without an edge.
  background: '#F6F4FD',
  gradient: ['#FAF9FE', '#F6F4FD', '#F1EEFA'],

  // Nothing is blurred behind it, so this is the whole surface; nearly white, a card reads as a card without a shadow.
  glassFill: 'rgba(255,255,255,0.88)',
  glassBorder: 'rgba(255,255,255,0.45)',

  scrim: 'rgba(16,12,36,0.45)',
  textOnScrim: '#FFFFFF',
  separator: 'rgba(20,17,46,0.07)',


  clayBorder: 'rgba(255,255,255,0.8)',
  // A shadow leaning toward the ink rather than grey, so raised things stay clean.
  softShadow: '#2E284A',

  controlTrack: 'rgba(20,17,46,0.05)',
  // On is the violet, as everything chosen is; the knob's side says it too.
  switchOn: '#862BE2',
  switchOnThumb: '#FFFFFF',
  switchOff: '#7F7E91',
  switchOffThumb: '#FFFFFF',
  selectedFill: '#FFFFFF',
  locked: '#DFDEEA',
  lockedMark: '#A4A2B2',

  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  // White on the violet is 6.1:1; the neutral is a step under the page, and 14.6:1 under its ink.
  bubbleMine: '#862BE2',
  bubbleMineInk: '#FFFFFF',
  bubbleTheirs: '#E7E4F1',
  bubbleTheirsInk: '#14112E',
  barFill: '#FFFFFF',
  goldText: '#8A6400',
};

export const DARK: Palette = {
  scheme: 'dark',
  // The violet lifted for the night: 8.5:1 on the page, and the day's ink is written on it (8.1:1).
  primary: '#BF9BFE',
  accent: '#D3BDFE',
  gold: '#F0C24A',
  danger: '#FF9C90',
  success: '#86E2A4',
  successFill: 'rgba(87,185,107,0.18)',
  dangerFill: 'rgba(255,120,105,0.16)',

  textPrimary: '#F3F1FB',
  // 8.5:1 on the page and 6.7:1 on the raised surface.
  textSecondary: '#ADABC0',
  textOnPrimary: '#14112E',
  // 8.3:1 on the evening's paler gold.
  textOnGold: '#3A2A00',

  // The ink taken almost to black: a night with a colour, where a neutral grey reads as a screen switched off.
  background: '#100E1D',
  gradient: ['#141121', '#100E1D', '#161325'],

  glassFill: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.14)',

  scrim: 'rgba(4,2,12,0.62)',
  textOnScrim: '#FFFFFF',
  separator: 'rgba(255,255,255,0.08)',


  clayBorder: 'rgba(255,255,255,0.10)',
  softShadow: '#000000',

  controlTrack: 'rgba(255,255,255,0.11)',
  switchOn: '#BF9BFE',
  switchOnThumb: '#14112E',
  switchOff: '#716E85',
  switchOffThumb: '#FFFFFF',
  selectedFill: 'rgba(255,255,255,0.16)',
  locked: '#2D2B3E',
  lockedMark: '#55526A',

  surface: '#1B192B',
  surfaceRaised: '#27243A',
  // By night your words are on a deeper violet so white reads on it (6.7:1); the neutral is a step over the raised
  // surface, 11.9:1 under its ink.
  bubbleMine: '#7935C6',
  bubbleMineInk: '#FFFFFF',
  bubbleTheirs: '#302C46',
  bubbleTheirsInk: '#F3F1FB',
  barFill: '#27243A',
  goldText: '#F0C24A',
};

export const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };
