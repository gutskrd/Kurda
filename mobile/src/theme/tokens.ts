/**
 * Design tokens — the single source of visual truth (KUR-011).
 * Components never hardcode colors/spacing; they import from here.
 */

export const colors = {
  // Kurdish-inspired palette: green fields, golden sun
  primary: '#2D6A4F',
  primaryDark: '#1B4332',
  accent: '#D4A017',
  sun: '#EBA905',
  danger: '#C0392B',
  success: '#2E7D32',

  background: '#FFFFFF',
  surface: '#F4F6F5',
  border: '#E0E5E2',
  textPrimary: '#15241D',
  textSecondary: '#5C6B63',
  textOnPrimary: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** The website's radius scale, to the pixel — its --r-* tokens. */
export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const typography = {
  /**
   * System fonts render Kurdish Latin diacritics (ê î û ç ş) correctly on
   * both platforms. Any future custom font MUST be verified against the
   * full Kurdish character set before shipping (no tofu/fallback mixing).
   */
  fontFamily: 'System',
  /**
   * The display face, for headings — the same one the website sets as
   * `--font-display` and applies to every h1–h4.
   *
   * Kept as data, by platform, because this module is deliberately free of
   * React Native so it can be unit-tested; `fonts.ts` resolves it. The order
   * mirrors the browser stack: a Mac or an iPhone lands on Iowan Old Style,
   * so an iPhone reading hevalo.app and an iPhone running the app see the
   * same letters.
   *
   * Body copy stays on the system face. That is what iOS does with a brand
   * serif, and what the website does — the serif is for titles, not for
   * paragraphs.
   */
  displayByPlatform: {
    iosFont: 'Iowan Old Style',
    androidFont: 'serif',
    webFont: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  },
  /** Headings are 600 on the web, not 700 — a serif at 700 gets heavy fast. */
  displayWeight: '600',
  /** The website sets line-height 1.12 and letter-spacing -0.01em on headings. */
  displayLineHeight: 1.12,
  displayTracking: -0.01,
  /**
   * One scale, used everywhere: 34 and 28 for large titles (in the display
   * serif, where it is already used), 22 for a section's title, 17 for body
   * text and rows, 15 for what is secondary, 13 for captions. Nothing smaller
   * than 11, which only the tab labels use.
   *
   * It was the website's 12/14/16/20/26/34, a point under the platform's own
   * sizes at every step, so a row read as nearly native rather than native
   * and a caption was harder to read than it needed to be for the youngest
   * readers.
   */
  sizes: {
    xs: 13,
    sm: 15,
    md: 17,
    lg: 22,
    xl: 28,
    xxl: 34,
  },
  /**
   * The sizes iOS sets its own controls at.
   *
   * Not the website's scale above, which is what body copy and headings
   * use. These three come from the Human Interface Guidelines and are what
   * makes a row, a button or a tab label read as native rather than as
   * approximately native — a settings row at 16 is a settings row that is
   * one point wrong, on every line, forever.
   *
   * Nine styles had copied the numbers loose, each from whichever other one
   * its author happened to look at.
   */
  ios: {
    /** a tab bar label */
    tabLabel: 11,
    /** the label on a button */
    button: 15,
    /** the title and the value on a list row */
    row: 17,
  },
  weights: {
    regular: '400',
    medium: '500',
    /** What the website's buttons and headings are; 700 is too heavy for both. */
    semibold: '600',
    bold: '700',
  },
} as const;

/**
 * The page's own geometry.
 *
 * `gutter` is the space between a screen's edge and its content on a phone:
 * 16, so the five tabs line up with each other and with the island bar's
 * inner edge. It lives here rather than in `spacing`, which is a scale of
 * steps — this is one decision, not a step on it.
 */
export const layout = {
  gutter: 16,
  /** between rows in a list that has no dividers */
  rowGap: 12,
  /**
   * How wide a list or a page of reading gets on a tablet or a wide window.
   * Past this a row is a band across the screen and the eye loses its place
   * on the way back to the start of the next line. The shop, the season and
   * the stories already stopped here; this names the number they share.
   */
  column: 680,
} as const;

/**
 * The full Kurdish Latin special-character set. NOT for display — used
 * by tests (and future font checks) to verify diacritic rendering.
 */
export const KURDISH_CHARSET = 'ÊêÎîÛûÇçŞş';

/**
 * RTL readiness (future Sorani/Arabic-script support, KUR-093):
 * layouts must use logical start/end properties, never left/right.
 * Flipping this on is the switch point; nothing should break before it.
 */
export const rtlReady = false;
