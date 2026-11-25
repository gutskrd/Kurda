/**
 * Hevalo's colours for both apps: one warm page, light and dark, and three colour themes that sit on it. A theme is a
 * main colour for the one main action on a screen, a second colour for what is chosen or in progress, and the gold
 * every theme shares for what is earned. The website's tokens.css and the phone's palette.ts read their values from
 * here (or are tested against them), so switching `THEME` switches both apps.
 */
export type ThemeScheme = 'light' | 'dark';

export const THEME_NAMES = ['hearth', 'pomegranate', 'zagros'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

/** The theme both apps wear. */
export const THEME: ThemeName = 'zagros';

/** The page every theme sits on: a warm soft white by day and a warm soft black by night, never pure white or black. */
export interface ThemePage {
  /** The page itself. */
  page: string;
  /** A card on the page, one step up. */
  surface: string;
  /** Something inside a card (a chip, a field), one more step. */
  raised: string;
  /** Words and glyphs: warm charcoal by day, warm off-white by night. */
  ink: string;
  /** Secondary words: captions, times, previews. */
  inkSoft: string;
  /** The hairline round a card. */
  hairline: string;
}

export const PAGE: Readonly<Record<ThemeScheme, ThemePage>> = {
  light: { page: '#FAF7F2', surface: '#FFFDF9', raised: '#FFFEFB', ink: '#2B2621', inkSoft: '#6B6259', hairline: 'rgba(43,38,33,0.1)' },
  dark: { page: '#161412', surface: '#211E1B', raised: '#2B2723', ink: '#F4EEE6', inkSoft: '#B0A69B', hairline: 'rgba(244,238,230,0.1)' },
};

/**
 * A theme's two colours in one scheme. Both are deep enough for the page's soft white to be written on them, by day and
 * by night: at night they are jewel tones that sit in the dark rather than glare on it. A chosen chip or tab is the
 * second colour filled by day and a tint of it with `secondaryText` by night, where a lit fill would shout.
 */
export interface ThemeColors {
  /** The main action's fill: the screen's one main button, the road's stop to do now, a lesson's Check. */
  primary: string;
  /** Words on the main colour. */
  onPrimary: string;
  /** The main colour pressed, and the darker lip under the road's stop. */
  primaryPressed: string;
  /** What is chosen or in progress, as a fill: a chosen chip by day, your chat bubble. */
  secondary: string;
  /** Words on the second colour. */
  onSecondary: string;
  /** The second colour as words and marks on the page: a chosen tab's glyph, a chosen chip's word by night. */
  secondaryText: string;
}

export const THEMES: Readonly<Record<ThemeName, Readonly<Record<ThemeScheme, ThemeColors>>>> = {
  // Terracotta, like a clay oven, with sage.
  hearth: {
    light: { primary: '#BC4E36', onPrimary: '#FFFDF9', primaryPressed: '#9E3F2B', secondary: '#5B7356', onSecondary: '#FFFDF9', secondaryText: '#5B7356' },
    dark: { primary: '#B4573C', onPrimary: '#FFF8EE', primaryPressed: '#9A4A33', secondary: '#4F6E4B', onSecondary: '#FFF8EE', secondaryText: '#A9C29B' },
  },
  // A deep pomegranate red with olive.
  pomegranate: {
    light: { primary: '#AD3A47', onPrimary: '#FFFDF9', primaryPressed: '#8E2D39', secondary: '#5D6A2F', onSecondary: '#FFFDF9', secondaryText: '#5D6A2F' },
    dark: { primary: '#BA4552', onPrimary: '#FFF8EE', primaryPressed: '#9C3843', secondary: '#5E6C30', onSecondary: '#FFF8EE', secondaryText: '#C2CC8A' },
  },
  // The deep green of the Zagros valleys, with terracotta.
  zagros: {
    light: { primary: '#1F6F63', onPrimary: '#FFFDF9', primaryPressed: '#17574D', secondary: '#AE5638', onSecondary: '#FFFDF9', secondaryText: '#AE5638' },
    dark: { primary: '#1B7E6D', onPrimary: '#FFF8EE', primaryPressed: '#166B5D', secondary: '#AD5539', onSecondary: '#FFF8EE', secondaryText: '#EDA07F' },
  },
};

/**
 * What is earned (XP, Zêr, the streak, medals), the same gold in every theme: `gold` for fills and marks, `goldText`
 * for words in gold on the page, `onGold` for words on a gold fill.
 */
export const REWARD_GOLD: Readonly<Record<ThemeScheme, { gold: string; goldText: string; onGold: string }>> = {
  light: { gold: '#E3A21A', goldText: '#8A5D0A', onGold: '#3A2604' },
  dark: { gold: '#F2B632', goldText: '#F5C85A', onGold: '#2A1D05' },
};

/**
 * Hevalo+'s own button, the one control styled apart from the main colour: a rich gold with a gold edge, set off from
 * the theme so a membership never looks like an ordinary next step. `fill` runs top to bottom.
 */
export const PLUS_STYLE: Readonly<Record<ThemeScheme, { fill: readonly [string, string]; edge: string; ink: string; glow: string }>> = {
  light: { fill: ['#F7CB5E', '#E3A21A'], edge: '#B97F12', ink: '#3A2604', glow: 'rgba(227,162,26,0.35)' },
  dark: { fill: ['#F8D374', '#E8A928'], edge: '#F8D98A', ink: '#2A1D05', glow: 'rgba(242,182,50,0.3)' },
};

/** A theme's colours in one scheme. */
export function themeColors(scheme: ThemeScheme, name: ThemeName = THEME): ThemeColors {
  return THEMES[name][scheme];
}
