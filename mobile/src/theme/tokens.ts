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
   * so an iPhone reading mykurda.com and an iPhone running the app see the
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
  sizes: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 20,
    xl: 26,
    xxl: 34,
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
