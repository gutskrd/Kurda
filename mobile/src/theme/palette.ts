/**
 * The light and dark palettes: the slate page and the one accent from `@kurda/shared` (themes.ts), so both apps wear
 * the same. Most of a screen is the page; the accent fills the main buttons and progress bars and marks a switch that
 * is on, links and the stop to do now. What is chosen (a tab, a chip, a segment) is shown in the ink, never a colour.
 * Gold is what is earned, and words and glyphs are the page's slate ink (`primary`). Green and red mean right and wrong but are never the only signal.
 *
 * Components read the active `Palette` from ThemeProvider, and `palette.contrast.test.ts` holds every text-on-surface
 * pair to WCAG AA.
 */
import { ACCENT, ANSWER, PAGE, REWARD_GOLD } from '@kurda/shared';
import type { ColorScheme } from './appearance';

export interface Palette {
  scheme: ColorScheme;

  /*
   * `accent` is the one accent's fill (a main button, a progress bar, a switch that is on), with `textOnAccent` written
   * on it and `accentLip` the darker edge a main button stands on; `accentText` is the accent as words and marks on the
   * page (a link, the tab you are on) and `accentSoft` its faint tint. `primary` is the ink for what is pressable (a
   * glyph), the same as `textPrimary`, with `textOnPrimary` written on it.
   */
  primary: string;
  accent: string;
  textOnAccent: string;
  accentLip: string;
  accentText: string;
  accentSoft: string;
  /** A chosen chip or segment: a faint ground of the ink with its word and edge in the ink, in both schemes. */
  chosenFill: string;
  chosenInk: string;
  chosenEdge: string;
  /** The one picked among a row of small choices drawn as pills of their own (a year, a month, a filter): the ink filled, the page's colour on it. */
  pickedFill: string;
  pickedInk: string;
  /** A line of light along a card's top edge; none, since cards are flat steps of the slate. */
  cardRim: string;
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
  /**
   * A chunky button that means nothing in particular: a flat slate fill on its darker lip. An outlined button's edge
   * and the lip it stands on are `btnEdge`, the third step of the slate.
   */
  neutralFill: string;
  neutralLip: string;
  btnEdge: string;
  softShadow: string; // Outer drop-shadow colour.

  controlTrack: string; // Inactive segmented control track.
  /**
   * A switch's track and knob, on and off. On is the accent; a right answer has its own green. Each track clears 3:1 on every surface and each knob 3:1 on its track (WCAG 1.4.11), and the knob's side
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
   * A conversation's two voices, matching the website's `--bubble-*`: your words on the accent, the other side's in
   * the page's ink on a step off the page. All four are solid, since a bubble's tail is a second shape beside it and two
   * translucent shapes would show their overlap.
   */
  bubbleMine: string;
  bubbleMineInk: string;
  bubbleTheirs: string;
  bubbleTheirsInk: string;

  /**
   * The fill of what floats over the page (the tab bar, the back button, the pill of top actions) where no glass can be
   * drawn: a solid neutral grey, cool rather than warm, since nothing blurs behind it and translucency would show the
   * page beneath as a ghost.
   */
  barFill: string;
  /** The line of light round that floating shape's edge, on its upper side and on the rest (LiquidGlass.tsx). */
  glassRim: string;
  glassRimFar: string;
  /** The neutral grey of the glass that blurs the page behind it, where it is drawn by the app rather than the system. */
  glassTint: string;
  /** A sheet or menu floating over the page: the floating chrome's neutral grey rather than the page's slate. */
  panel: string;
  /** The chosen tab's glyph and name, and the darker capsule of glass inset behind it, drawn faint (TabBar.tsx `CAPSULE_FILL`). */
  tabChosen: string;
  tabCapsule: string;
  /** The lens a choice lifts into as it moves: clear and a little brighter than the bar, its rim lit, its edge split. */
  lensFill: string;
  lensRim: string;
  lensShine: string;
  lensWarm: string;
  lensCool: string;
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

const DAY = ACCENT.light;
const NIGHT = ACCENT.dark;

export const LIGHT: Palette = {
  scheme: 'light',
  primary: PAGE.light.ink,
  accent: DAY.fill,
  textOnAccent: DAY.ink,
  accentLip: DAY.lip,
  accentText: DAY.text,
  accentSoft: 'rgba(0,134,59,0.08)',
  chosenFill: 'rgba(23,36,43,0.06)',
  chosenInk: PAGE.light.ink,
  chosenEdge: PAGE.light.ink,
  pickedFill: PAGE.light.ink,
  pickedInk: PAGE.light.page,
  cardRim: 'transparent',
  gold: REWARD_GOLD.light.gold,
  danger: ANSWER.light.wrong.text,
  like: '#E0263F',
  saved: '#F5B400',
  savedEdge: '#A87600',
  success: ANSWER.light.right.text,
  successFill: '#E6EFE1',
  dangerFill: '#FAE8E6',

  textPrimary: PAGE.light.ink,
  textSecondary: PAGE.light.inkSoft,
  textOnPrimary: '#F7F9FA',
  textOnGold: REWARD_GOLD.light.onGold,

  // A soft clean white, with light grey surfaces stepped down from it.
  background: PAGE.light.page,
  gradient: ['#F9FBFB', PAGE.light.page, '#F2F5F7'],

  // Nothing is blurred behind it, so this is the whole surface: a near-white card without a shadow.
  glassFill: 'rgba(253,254,254,0.9)',
  glassBorder: 'rgba(253,254,254,0.5)',

  scrim: 'rgba(10,18,22,0.48)',
  textOnScrim: '#F7F9FA',
  separator: 'rgba(23,36,43,0.08)',

  clayBorder: 'rgba(253,254,254,0.8)',
  neutralFill: PAGE.light.raised,
  neutralLip: '#C9D4D9',
  btnEdge: PAGE.light.high,
  // A shadow in the slate's own blue-grey.
  softShadow: '#17242B',

  controlTrack: 'rgba(23,36,43,0.06)',
  switchOn: DAY.fill,
  switchOnThumb: DAY.ink,
  switchOff: '#71838B',
  switchOffThumb: '#FDFEFE',
  selectedFill: '#FDFEFE',
  locked: '#DCE3E7',
  lockedMark: '#9AABB3',

  surface: PAGE.light.surface,
  surfaceRaised: PAGE.light.raised,
  bubbleMine: DAY.fill,
  bubbleMineInk: DAY.ink,
  bubbleTheirs: PAGE.light.raised,
  bubbleTheirsInk: PAGE.light.ink,
  barFill: '#FDFEFE',
  glassRim: 'rgba(255,255,255,0.9)',
  glassRimFar: 'rgba(23,36,43,0.09)',
  glassTint: 'rgba(250,251,252,0.74)',
  panel: '#FDFEFE',
  tabChosen: DAY.text,
  tabCapsule: PAGE.light.ink,
  lensFill: 'rgba(255,255,255,0.34)',
  lensRim: 'rgba(255,255,255,0.9)',
  lensShine: 'rgba(255,255,255,1)',
  lensWarm: 'rgba(255,110,110,0.3)',
  lensCool: 'rgba(90,160,255,0.32)',
  onArt: 'rgba(253,254,254,0.78)',
  goldText: REWARD_GOLD.light.goldText,
  notice: '#FF3B30',
};

export const DARK: Palette = {
  scheme: 'dark',
  primary: PAGE.dark.ink,
  accent: NIGHT.fill,
  textOnAccent: NIGHT.ink,
  accentLip: NIGHT.lip,
  accentText: NIGHT.text,
  accentSoft: 'rgba(50,212,107,0.14)',
  chosenFill: 'rgba(238,243,245,0.1)',
  chosenInk: PAGE.dark.ink,
  chosenEdge: PAGE.dark.ink,
  pickedFill: PAGE.dark.ink,
  pickedInk: PAGE.dark.page,
  cardRim: 'transparent',
  gold: REWARD_GOLD.dark.gold,
  danger: ANSWER.dark.wrong.text,
  like: '#FF5A6A',
  saved: '#FFC83D',
  savedEdge: '#FFC83D',
  success: ANSWER.dark.right.text,
  successFill: ANSWER.dark.right.soft,
  dangerFill: ANSWER.dark.wrong.soft,

  textPrimary: PAGE.dark.ink,
  textSecondary: PAGE.dark.inkSoft,
  // Words on the night's light ink, as on a chosen pill or an ink button.
  textOnPrimary: '#131C20',
  textOnGold: REWARD_GOLD.dark.onGold,

  // The cool slate night; never pure black, which reads as a screen switched off.
  background: PAGE.dark.page,
  gradient: ['#152024', PAGE.dark.page, '#141E22'],

  glassFill: 'rgba(156,190,204,0.06)',
  glassBorder: 'rgba(238,243,245,0.12)',

  scrim: 'rgba(5,9,11,0.62)',
  textOnScrim: '#F7F9FA',
  separator: 'rgba(238,243,245,0.08)',

  clayBorder: 'rgba(238,243,245,0.10)',
  neutralFill: PAGE.dark.high,
  neutralLip: '#222D33',
  btnEdge: PAGE.dark.high,
  softShadow: '#05080A',

  controlTrack: 'rgba(156,190,204,0.1)',
  switchOn: NIGHT.fill,
  switchOnThumb: NIGHT.ink,
  switchOff: '#6B7E87',
  switchOffThumb: '#EEF3F5',
  selectedFill: 'rgba(156,190,204,0.2)',
  locked: '#2E3C43',
  lockedMark: '#52656E',

  surface: PAGE.dark.surface,
  surfaceRaised: PAGE.dark.raised,
  bubbleMine: NIGHT.fill,
  bubbleMineInk: NIGHT.ink,
  bubbleTheirs: '#253238',
  bubbleTheirsInk: PAGE.dark.ink,
  barFill: '#24272B',
  glassRim: 'rgba(255,255,255,0.14)',
  glassRimFar: 'rgba(255,255,255,0.1)',
  glassTint: 'rgba(42,45,49,0.62)',
  panel: '#23272B',
  tabChosen: NIGHT.text,
  tabCapsule: '#000000',
  lensFill: 'rgba(255,255,255,0.13)',
  lensRim: 'rgba(255,255,255,0.34)',
  lensShine: 'rgba(255,255,255,0.55)',
  lensWarm: 'rgba(255,120,120,0.36)',
  lensCool: 'rgba(110,180,255,0.38)',
  onArt: 'rgba(19,28,32,0.6)',
  goldText: REWARD_GOLD.dark.goldText,
  notice: '#FF453A',
};

export const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };
