/**
 * The light and dark palettes: the warm page and the colour theme from `@kurda/shared` (themes.ts), so both apps wear
 * the same. The theme's main colour is the main button's alone (`accent`), its second colour marks what is chosen or in
 * progress (`secondary`), gold is what is earned, and words and glyphs are the page's warm ink (`primary`). Green and
 * red mean right and wrong but are never the only signal.
 *
 * Components read the active `Palette` from ThemeProvider, and `palette.contrast.test.ts` holds every text-on-surface
 * pair to WCAG AA.
 */
import { PAGE, REWARD_GOLD, themeColors } from '@kurda/shared';
import type { ColorScheme } from './appearance';

export interface Palette {
  scheme: ColorScheme;

  /*
   * `accent` is the theme's main colour, the main button's fill and nothing else's. `primary` is the ink for what is
   * pressable (a glyph, a link), the same as `textPrimary`, with `textOnPrimary` written on it, and on the accent too.
   * `secondary` is the theme's second colour, for what is chosen or in progress (a chosen chip or tab, a switch that is
   * on, your chat bubble), with `textOnSecondary` written on it.
   */
  primary: string;
  accent: string;
  secondary: string;
  textOnSecondary: string;
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
   * A switch's track and knob, on and off. On is the second colour, like everything chosen, not green, which here means
   * a right answer. Each track clears 3:1 on every surface and each knob 3:1 on its track (WCAG 1.4.11), and the knob's side
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
   * A conversation's two voices, matching the website's `--bubble-*`: your words on the theme's second colour, the
   * other side's in the page's ink on a step under the page. All four are solid, since a bubble's tail is a second shape beside it and two
   * translucent shapes would show their overlap.
   */
  bubbleMine: string;
  bubbleMineInk: string;
  bubbleTheirs: string;
  bubbleTheirsInk: string;

  /**
   * The fill of what floats over the page (the tab bar, the back button, the pill of top actions) where the system has
   * no Liquid Glass to draw: solid, since nothing blurs behind it and translucency would show the page beneath as a ghost.
   */
  barFill: string;
  /** The line of light round that floating shape's edge, on its upper side and on the rest (LiquidGlass.tsx). */
  glassRim: string;
  glassRimFar: string;
  /** The breath of tint on clear glass that bends the page, so the words on it stay readable. */
  glassTint: string;
  /** A control's disc where it stands on a drawing (a chapter's banner): the page's colour, mostly opaque. */
  onArt: string;

  /*
   * Gold for text, which is not gold for fills. The sun's gold (`gold`) reads as text on the dark page, but is 1.9:1
   * on the light one, so light-mode gold text uses this darker ochre, which clears 4.5:1 on the page and a white card.
   */
  goldText: string;

  /** Something new waiting (an unread message, a gift): the small dot on a tab, in the red every phone uses for it. */
  notice: string;

  /**
   * A heart given is red and something saved is yellow, as everywhere people like and keep things; only the glyph wears
   * them. A saved bookmark has a deeper edge by day (`savedEdge`), where yellow alone is faint on white.
   */
  like: string;
  saved: string;
  savedEdge: string;
}

const DAY = themeColors('light');
const NIGHT = themeColors('dark');

export const LIGHT: Palette = {
  scheme: 'light',
  primary: PAGE.light.ink,
  accent: DAY.primary,
  secondary: DAY.secondary,
  textOnSecondary: DAY.onSecondary,
  gold: REWARD_GOLD.light.gold,
  danger: '#B83A2E',
  like: '#E0263F',
  saved: '#F5B400',
  savedEdge: '#A87600',
  success: '#2F7A45',
  successFill: '#E2F2E1',
  dangerFill: '#FBE9E4',

  textPrimary: PAGE.light.ink,
  textSecondary: PAGE.light.inkSoft,
  textOnPrimary: DAY.onPrimary,
  textOnGold: REWARD_GOLD.light.onGold,

  // A warm soft white, so cards a step lighter lift off it with only a hairline.
  background: PAGE.light.page,
  gradient: ['#FCFAF6', PAGE.light.page, '#F6F2EB'],

  // Nothing is blurred behind it, so this is the whole surface: the card's warm white, a card without a shadow.
  glassFill: 'rgba(255,253,249,0.9)',
  glassBorder: 'rgba(255,253,249,0.5)',

  scrim: 'rgba(22,20,18,0.48)',
  textOnScrim: '#FFFDF9',
  separator: 'rgba(43,38,33,0.08)',

  clayBorder: 'rgba(255,253,249,0.8)',
  // A shadow leaning warm rather than grey, as a lamp casts one.
  softShadow: '#3A2F25',

  controlTrack: 'rgba(43,38,33,0.06)',
  switchOn: DAY.secondary,
  switchOnThumb: DAY.onSecondary,
  switchOff: '#857A6F',
  switchOffThumb: '#FFFDF9',
  selectedFill: PAGE.light.surface,
  locked: '#E8E1D7',
  lockedMark: '#ABA092',

  surface: PAGE.light.surface,
  surfaceRaised: PAGE.light.raised,
  bubbleMine: DAY.secondary,
  bubbleMineInk: DAY.onSecondary,
  bubbleTheirs: '#F0EAE1',
  bubbleTheirsInk: PAGE.light.ink,
  barFill: PAGE.light.surface,
  glassRim: 'rgba(255,253,249,0.9)',
  glassRimFar: 'rgba(43,38,33,0.07)',
  glassTint: 'rgba(255,253,249,0.22)',
  onArt: 'rgba(255,253,249,0.78)',
  goldText: REWARD_GOLD.light.goldText,
  notice: '#FF3B30',
};

export const DARK: Palette = {
  scheme: 'dark',
  primary: PAGE.dark.ink,
  accent: NIGHT.primary,
  secondary: NIGHT.secondary,
  textOnSecondary: NIGHT.onSecondary,
  gold: REWARD_GOLD.dark.gold,
  danger: '#FF9C90',
  like: '#FF5A6A',
  saved: '#FFC83D',
  savedEdge: '#FFC83D',
  success: '#8FD3A0',
  successFill: 'rgba(120,200,140,0.16)',
  dangerFill: 'rgba(245,140,120,0.16)',

  textPrimary: PAGE.dark.ink,
  textSecondary: PAGE.dark.inkSoft,
  textOnPrimary: NIGHT.onPrimary,
  textOnGold: REWARD_GOLD.dark.onGold,

  // A warm soft black, like a room with the lamp low; never pure black, which reads as a screen switched off.
  background: PAGE.dark.page,
  gradient: ['#1A1715', PAGE.dark.page, '#1C1916'],

  glassFill: 'rgba(255,248,240,0.06)',
  glassBorder: 'rgba(255,248,240,0.12)',

  scrim: 'rgba(10,8,6,0.62)',
  textOnScrim: '#FFFDF9',
  separator: 'rgba(255,248,240,0.08)',

  clayBorder: 'rgba(255,248,240,0.10)',
  softShadow: '#0A0807',

  controlTrack: 'rgba(255,248,240,0.10)',
  switchOn: NIGHT.secondary,
  switchOnThumb: NIGHT.onSecondary,
  switchOff: '#7E746A',
  switchOffThumb: '#FFFDF9',
  selectedFill: 'rgba(255,248,240,0.16)',
  locked: '#2E2A26',
  lockedMark: '#5A524A',

  surface: PAGE.dark.surface,
  surfaceRaised: PAGE.dark.raised,
  bubbleMine: NIGHT.secondary,
  bubbleMineInk: NIGHT.onSecondary,
  bubbleTheirs: '#34302B',
  bubbleTheirsInk: PAGE.dark.ink,
  barFill: PAGE.dark.raised,
  glassRim: 'rgba(255,248,240,0.3)',
  glassRimFar: 'rgba(255,248,240,0.1)',
  glassTint: 'rgba(32,29,26,0.3)',
  onArt: 'rgba(22,20,18,0.6)',
  goldText: REWARD_GOLD.dark.goldText,
  notice: '#FF453A',
};

export const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };
