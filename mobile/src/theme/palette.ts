/**
 * Themed palettes (KUR-268), light and dark.
 *
 * Hevalo's own colour is the violet of its icon. The page is a white with a
 * breath of that violet in it, the words are written in a deep indigo ink
 * rather than black, and the violet itself is kept for what can be pressed or
 * is chosen: a button, a link, the tab you are on. So a screen is mostly
 * quiet page and white cards, and the eye goes to the one violet thing.
 *
 * Gold, the Kurdish sun, is for what is earned: XP, Zêr, the streak, a medal.
 * Green and red mean right and wrong (or safe and destructive) and are never
 * the only signal. Anything else that needs a colour of its own — a game, a
 * way to practise — takes one of the shared hues (shared `hues.ts`), which
 * are cut to sit beside this violet.
 *
 * By night the page is the same indigo taken almost to black, never a
 * neutral grey, and the violet is lifted so it does not glare. Components
 * read the active `Palette` from ThemeProvider so both schemes stay in sync,
 * and `palette.contrast.test.ts` holds every text-on-surface pair to WCAG AA.
 */
import type { ColorScheme } from './appearance';

export interface Palette {
  scheme: ColorScheme;

  /*
   * The brand: one violet, and one ink beside it.
   *
   * `primary` is the violet: what fills a button, tints a glyph that can be
   * pressed, writes a link and marks what is chosen. `textPrimary` is the ink
   * that everything else is written in. There is one of each, so two buttons
   * side by side are never two colours. `accent` is the violet a step deeper
   * (paler by night), for the few places that need a second tone of it.
   */
  primary: string;
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
  /**
   * What is written or drawn on a gold fill: a pill, a place on a podium, a
   * letter that is in the word but in the wrong square.
   *
   * Not `textOnPrimary`, which is white by day, and white on the sun's gold
   * is 2.1:1. This is the deep brown the course map already wrote on a gold
   * trophy; two other screens had each mixed their own. It clears 4.5:1 on
   * `gold` in both schemes, and is the same brown in both, because the gold
   * is light in both.
   */
  textOnGold: string;

  // spatial background (a 3-stop gradient gives depth behind the glass)
  background: string;
  gradient: readonly [string, string, string];

  // frosted glass — three blur tiers so we can go stronger on
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
  /**
   * What sits on the scrim: a spinner over a photo while it uploads. The
   * scrim is dark in both schemes, so this is light in both, where
   * `textOnPrimary` turns dark with the dark scheme and would vanish there.
   */
  textOnScrim: string;

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
   * In the app's violet, not green. Green in this app means a right answer,
   * and a switch that is on is not right, only on; a screen of settings in
   * green reads as a screen of things that went well. Violet is what
   * everything chosen here is drawn in, so a switch that is on looks like the
   * tab you are on and the option you picked. Gold stays for what is earned,
   * red for what cannot be undone.
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
   * A conversation's two voices, the same as the website's `--bubble-*`.
   *
   * Your own words are on the app's violet, in white; the other side's are a
   * quiet neutral in the page's own ink. They were on the sun's gold, which
   * put a second colour beside the violet of the button that sends them, and
   * gold is for what is earned.
   *
   * Solid, all four: a bubble's tail is a second shape drawn in the same
   * colour beside it, and two translucent shapes show where they overlap.
   */
  bubbleMine: string;
  bubbleMineInk: string;
  bubbleTheirs: string;
  bubbleTheirsInk: string;

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
  // 6.3:1 on the page, 6.9:1 on a card and 5.5:1 on the other side's chat bubble
  textSecondary: '#595870',
  textOnPrimary: '#FFFFFF',
  // 6.8:1 on the gold
  textOnGold: '#3A2A00',

  // white with a breath of the violet in it, so white cards lift off it without an edge
  background: '#F6F4FD',
  gradient: ['#FAF9FE', '#F6F4FD', '#F1EEFA'],

  // no blur behind it, so this is the whole surface. At 0.34 white over a
  // near-white page a card was all but invisible and only its shadow said
  // where it was; nearly white, it is a card again without needing one.
  glassFill: 'rgba(255,255,255,0.88)',
  glassBorder: 'rgba(255,255,255,0.45)',

  scrim: 'rgba(16,12,36,0.45)',
  textOnScrim: '#FFFFFF',
  separator: 'rgba(20,17,46,0.07)',


  clayBorder: 'rgba(255,255,255,0.8)',
  // a shadow leans toward the ink rather than toward grey, so a raised thing stays clean
  softShadow: '#2E284A',

  controlTrack: 'rgba(20,17,46,0.05)',
  // on is the violet, as everything chosen is; the knob's side says it too
  switchOn: '#862BE2',
  switchOnThumb: '#FFFFFF',
  switchOff: '#7F7E91',
  switchOffThumb: '#FFFFFF',
  selectedFill: '#FFFFFF',
  locked: '#DFDEEA',
  lockedMark: '#A4A2B2',

  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  // white on the violet is 6.1:1; the neutral is a step under the page, and 14.6:1 under its ink
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
  // 8.5:1 on the page and 6.7:1 on the raised surface
  textSecondary: '#ADABC0',
  textOnPrimary: '#14112E',
  // 8.3:1 on the evening's paler gold
  textOnGold: '#3A2A00',

  // the ink itself, taken almost to black: a night with a colour, where a neutral grey reads as a screen switched off
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
  // by night your words are on the day's violet, a step deeper so white reads on it (6.7:1); the neutral is a step over the raised surface, 11.9:1 under its ink
  bubbleMine: '#7935C6',
  bubbleMineInk: '#FFFFFF',
  bubbleTheirs: '#302C46',
  bubbleTheirsInk: '#F3F1FB',
  barFill: '#27243A',
  goldText: '#F0C24A',
};

export const PALETTES: Record<ColorScheme, Palette> = { light: LIGHT, dark: DARK };
