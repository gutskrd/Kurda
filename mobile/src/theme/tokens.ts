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
  /** The device's own face for every word and every script: system fonts render the Kurdish letters (ê î û ç ş) on both platforms. */
  fontFamily: 'System',
  /** Titles are 600 with tightened leading and tracking; 700 is too heavy. */
  displayWeight: '600',
  displayLineHeight: 1.15,
  displayTracking: -0.01,
  /** Two sizes and no others: `title` for a screen's title and a hero number or word, `text` for every other word. */
  sizes: {
    text: 16,
    title: 28,
  },
  weights: {
    regular: '400',
    medium: '500',
    /** Headings and buttons; 700 is too heavy for both. */
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
