/**
 * Themed palettes (KUR-268), light and dark.
 *
 * A calm, mostly monochrome interface — near-black on near-white, near-white
 * on near-black — so that what people write and the art carry the colour,
 * with one warm accent: the gold of the Kurdish sun, for rewards, the streak,
 * Zêr and highlights. Green and red mean right and wrong (or safe and
 * destructive) and are used sparingly, never as the only signal.
 *
 * The cards keep a light glass treatment; the page and the tab bar are
 * flat. Components read the active `Palette` from
 * ThemeProvider so both schemes stay in sync, and `palette.contrast.test.ts`
 * holds every text-on-surface pair to WCAG AA.
 */
import type { ColorScheme } from './appearance';

export interface Palette {
  scheme: ColorScheme;

  // brand
  primary: string;
  primaryStrong: string;
  accent: string;
  gold: string;
  danger: string;
  success: string;
  successFill: string; // soft tint behind a "correct" banner
  dangerFill: string; // soft tint behind a "wrong" banner

  // text
  textPrimary: string;
  textSecondary: string;
  textOnPrimary: string;

  // spatial background (a 3-stop gradient gives depth behind the glass)
  background: string;
  gradient: readonly [string, string, string];

  // glassmorphism / liquid glass — three blur tiers so we can go stronger on
  // floating surfaces (nav, modals, sheets) and lighter on flat, scrolled content
  // (cards, rows) where heavy blur costs performance and hurts readability.
  glassFill: string; // translucent tint painted over the blur
  glassBorder: string; // hairline edge — kept subtle (no "frost line")

  /*
   * The boundary between two regions of a screen — and only that.
   *
   * It used to be the rule between rows inside a card too, which is a line
   * drawn across the middle of a surface, and there are none of those left.
   * Three uses remain: the composer above the keyboard in a chat and in a
   * group thread, and the hairline under a header that content scrolls
   * beneath. Take those away and what you are writing runs into what you
   * have already sent.
   */
  /**
   * What dims the screen behind something raised over it.
   *
   * One value, because two things now raise something: the side panel and
   * the action button. It was a literal in the panel’s own stylesheet, which
   * is where the second one would have been written again, slightly different.
   */
  scrim: string;

  separator: string;

  /*
   * What is left of claymorphism: one border colour.
   *
   * `clayFill` was a white-to-grey vertical gradient for a soft, puffy
   * button. Nothing has used it since the buttons stopped being puffy, and a
   * painted-on highlight is the thing to reach for when a control looks flat
   * and the thing not to reach for when it is meant to be glass.
   */
  clayBorder: string;
  softShadow: string; // outer drop shadow colour (spatial elevation)

  controlTrack: string; // inactive segmented control track
  /**
   * A switch, on and off: its track and its knob.
   *
   * In the app's ink, not green. Green in this app means a right answer, and
   * a switch that is on is not right, only on; a screen of settings in green
   * reads as a screen of things that went well, and pulls the eye to every
   * switch at once. Ink is what every other control here is drawn in, so the
   * switches are calm and look like they belong. Colour is kept for what
   * needs noticing: gold for something to act on, red for what cannot be
   * undone.
   *
   * Each track clears 3:1 against every surface it sits on, and each knob
   * 3:1 against its track (WCAG 1.4.11); the knob's side is the second sign
   * of the state, so it is never told by colour alone. The knob is drawn in
   * its own colour on every platform, rather than iOS's shadowed white,
   * because in dark mode a white knob on the white track of a switch that is
   * on could not be seen.
   */
  switchOn: string;
  switchOnThumb: string;
  switchOff: string;
  switchOffThumb: string;
  /** The chosen option in a segmented control: a step up from its track. */
  selectedFill: string;

  /**
   * Something not reached yet — a league above yours: its shape in a quiet
   * grey, and the keyhole on it a step darker (lighter in the dark). Seen,
   * so it is something to look forward to, but nothing like the colour of
   * what has been earned. Not a control, so it is not held to 3:1.
   */
  locked: string;
  lockedMark: string;

  /*
   * The two raised surfaces, for things that sit on the page rather than
   * float over it: a card, a tile, a row that needs a ground of its own.
   *
   * Solid, not glass. The calm look the app is going for is a near-black or
   * near-white page with the user's own content and the art carrying the
   * colour, and a translucent fill over a gradient reads a little different
   * on every screen depending on what is behind it. `surfaceRaised` is the
   * one step up, for something inside a surface (a chip on a card).
   */
  surface: string;
  surfaceRaised: string;

  /**
   * The bar's own fill: solid.
   *
   * There is no blur behind the bar on any platform, so any translucency
   * shows what scrolls beneath as a ghost between the icons — at 94% white
   * text and bright cards were still plainly visible through it, on the
   * phone as much as in a browser, because an rgba fill composites the same
   * way everywhere. A hairline along its top edge is what separates it from
   * the page.
   */
  barFill: string;

  /*
   * Gold for words, which is not gold for fills.
   *
   * The sun's gold (`gold`) is what a reward, a streak or Zêr is painted in.
   * On the dark page it is legible as text too; on the light one it is
   * 1.9:1, so text in gold uses this darker ochre there, which clears 4.5:1
   * against the page and against a white card.
   */
  goldText: string;
}

export const LIGHT: Palette = {
  scheme: 'light',
  // Monochrome brand: near-black on a near-white app. The one warm accent is
  // the gold of the sun (rewards, streak, Zêr); danger and success stay
  // coloured for meaning and are never the only signal.
  primary: '#1A1A1A',
  primaryStrong: '#000000',
  accent: '#333333',
  gold: '#EBA905',
  danger: '#C0392B',
  success: '#2E7D32',
  successFill: '#E6F4EA',
  dangerFill: '#FBE9E7',

  textPrimary: '#111111',
  // 5.8:1 on the page; the old #6B6B6B was 4.9 on #F3F3F3 and under 4.5 on a
  // pressed row
  textSecondary: '#5E6066',
  textOnPrimary: '#FFFFFF',

  // a near-white with the faintest warmth, so white cards lift off it
  background: '#F6F6F5',
  gradient: ['#F9F9F8', '#F6F6F5', '#F1F1EF'],

  // no blur behind it, so this is the whole surface. At 0.34 white over a
  // near-white page a card was all but invisible and only its shadow said
  // where it was; nearly white, it is a card again without needing one.
  glassFill: 'rgba(255,255,255,0.88)',
  glassBorder: 'rgba(255,255,255,0.45)',

  scrim: 'rgba(0,0,0,0.45)',
  separator: 'rgba(20,20,20,0.07)',


  clayBorder: 'rgba(255,255,255,0.8)',
  softShadow: '#3A3A3A',

  controlTrack: 'rgba(0,0,0,0.05)',
  switchOn: '#1A1A1A',
  switchOnThumb: '#FFFFFF',
  switchOff: '#86898F',
  switchOffThumb: '#FFFFFF',
  selectedFill: '#FFFFFF',
  locked: '#E2E4E8',
  lockedMark: '#A5A9B0',

  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  barFill: '#FFFFFF',
  goldText: '#8A6400',
};

export const DARK: Palette = {
  scheme: 'dark',
  // Monochrome brand: near-white on a near-black app, with the sun's gold as
  // the one warm accent. Danger and success stay coloured for meaning.
  primary: '#FFFFFF',
  primaryStrong: '#FFFFFF',
  accent: '#CFCFCF',
  gold: '#F0C24A',
  danger: '#FF9C90',
  success: '#86E2A4',
  successFill: 'rgba(87,185,107,0.18)',
  dangerFill: 'rgba(255,120,105,0.16)',

  textPrimary: '#FFFFFF',
  // 8:1 on the page and 6.9:1 on the raised surface
  textSecondary: '#A3A6AD',
  textOnPrimary: '#141414',

  background: '#0B0D10',
  // neutral near-black spatial gradient (no colour tint)
  gradient: ['#0E1014', '#0B0D10', '#101318'],

  glassFill: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.14)',

  scrim: 'rgba(0,0,0,0.6)',
  separator: 'rgba(255,255,255,0.08)',


  clayBorder: 'rgba(255,255,255,0.10)',
  softShadow: '#000000',

  controlTrack: 'rgba(255,255,255,0.11)',
  switchOn: '#F2F3F5',
  switchOnThumb: '#0B0D10',
  switchOff: '#686C73',
  switchOffThumb: '#FFFFFF',
  selectedFill: 'rgba(255,255,255,0.16)',
  locked: '#262B33',
  lockedMark: '#4D545E',

  surface: '#14171C',
  surfaceRaised: '#1B1F26',
  barFill: '#1B1F26',
  goldText: '#F0C24A',
};

export const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };
