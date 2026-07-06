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

export const radii = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  /**
   * System fonts render Kurdish Latin diacritics (ê î û ç ş) correctly on
   * both platforms. Any future custom font MUST be verified against
   * kurdishSample before shipping (no tofu/fallback mixing).
   */
  fontFamily: 'System',
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
    bold: '700',
  },
} as const;

/** Rendered on placeholder screens so a font regression is visible instantly. */
export const kurdishSample = 'Êê Îî Ûû Çç Şş — Jiyan bi kurdî xweştire';

/**
 * RTL readiness (future Sorani/Arabic-script support, KUR-093):
 * layouts must use logical start/end properties, never left/right.
 * Flipping this on is the switch point; nothing should break before it.
 */
export const rtlReady = false;
