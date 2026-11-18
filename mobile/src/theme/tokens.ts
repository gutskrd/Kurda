/**
 * Design tokens for everything that is not a colour: spacing, corners, type and page geometry. Components import
 * these rather than hardcoding values. Colours live in `palette.ts`, one set per scheme, read through ThemeProvider.
 */

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
  // Square: a picture running edge to edge, whose corners are the screen's.
  none: 0,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 18,
  xl: 26,
  pill: 999,
} as const;

export const typography = {
  /** System fonts render the Kurdish Latin diacritics (ê î û ç ş) on both platforms; any custom font must be checked against the full set first. */
  fontFamily: 'System',
  /**
   * The display face for headings, matching the website's `--font-display`. Kept as per-platform data because this
   * module is free of React Native for unit tests; `fonts.ts` resolves it. The order mirrors the website's stack, so an
   * iPhone shows the same letters in the app and on hevalo.app. Body text stays on the system face.
   */
  displayByPlatform: {
    iosFont: 'Iowan Old Style',
    androidFont: 'serif',
    webFont: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
  },
  /** Headings are 600, as on the website; a serif at 700 gets heavy fast. */
  displayWeight: '600',
  /** The website's heading line height (1.12) and letter spacing (-0.01em). */
  displayLineHeight: 1.12,
  displayTracking: -0.01,
  /** One scale everywhere: 34 and 28 for large titles, 22 for section titles, 17 body and rows, 15 secondary, 13 captions, and 11 only for tab labels. */
  sizes: {
    xs: 13,
    sm: 15,
    md: 17,
    lg: 22,
    xl: 28,
    xxl: 34,
  },
  /** The sizes iOS sets its own controls at (Human Interface Guidelines), so rows, buttons and tab labels read as native. */
  ios: {
    /** A tab bar label. */
    tabLabel: 11,
    /** A button's label. */
    button: 15,
    /** A list row's title and value. */
    row: 17,
  },
  weights: {
    regular: '400',
    medium: '500',
    /** The website's button and heading weight; 700 is too heavy for both. */
    semibold: '600',
    bold: '700',
  },
} as const;

/**
 * How far the reader's text size may grow text inside something that cannot grow with it, as a
 * `maxFontSizeMultiplier`. Body text, rows and button labels are never capped, since they wrap and their boxes grow;
 * only text in a box sized in points is, where a larger letter would be pushed out of it.
 */
export const fontScaleCap = {
  /** A letter or count in a fixed-size box: a tile, a key, a badge, one segment of a control. */
  fixedBox: 1.2,
  /** A title kept to one line at an already large size. */
  heading: 1.3,
} as const;

/** The page's geometry. `gutter` is the phone's edge-to-content space (16), a single decision rather than a step on `spacing`. */
export const layout = {
  gutter: 16,
  /** Between rows in a list without dividers. */
  rowGap: 12,
  /** The widest a list or reading page gets on a tablet or wide window, past which the eye loses its place between lines. */
  column: 680,
} as const;

/** The tint behind a chosen or current item, as the tab bar draws it: the colour at 12% (hex alpha 1F). */
export const wash = (colour: string): string => `${colour}1F`;
