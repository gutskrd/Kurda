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
  dark: { page: '#161412', surface: '#201D1A', raised: '#2A2622', ink: '#F4EEE6', inkSoft: '#B0A69B', hairline: 'rgba(244,238,230,0.1)' },
};

/**
 * A theme's two colours in one scheme. By day both are deep enough for the page's soft white to be written on them;
 * by night both are lifted so they glow on the dark page, with the night's ink written on them.
 */
export interface ThemeColors {
  /** The main action's fill: the screen's one main button, the road's stop to do now, a lesson's Check. */
  primary: string;
  /** Words on the main colour. */
  onPrimary: string;
  /** The main colour pressed, and the darker lip under the road's stop. */
  primaryPressed: string;
  /** What is chosen or in progress: a chosen chip or tab, a switch that is on, your chat bubble, a progress bar. */
  secondary: string;
  /** Words on the second colour. */
  onSecondary: string;
}

export const THEMES: Readonly<Record<ThemeName, Readonly<Record<ThemeScheme, ThemeColors>>>> = {
  // Terracotta, like a clay oven, with sage.
  hearth: {
    light: { primary: '#BC4E36', onPrimary: '#FFFDF9', primaryPressed: '#9E3F2B', secondary: '#5B7356', onSecondary: '#FFFDF9' },
    dark: { primary: '#E5805F', onPrimary: '#1C1814', primaryPressed: '#C9684A', secondary: '#A9BE9C', onSecondary: '#1C1814' },
  },
  // A deep pomegranate red with olive.
  pomegranate: {
    light: { primary: '#AD3A47', onPrimary: '#FFFDF9', primaryPressed: '#8E2D39', secondary: '#5D6A2F', onSecondary: '#FFFDF9' },
    dark: { primary: '#E98A93', onPrimary: '#1C1814', primaryPressed: '#D06F79', secondary: '#B8C27E', onSecondary: '#1C1814' },
  },
  // The deep green of the Zagros valleys, with terracotta.
  zagros: {
    light: { primary: '#1F6F63', onPrimary: '#FFFDF9', primaryPressed: '#17574D', secondary: '#AE5638', onSecondary: '#FFFDF9' },
    dark: { primary: '#5FB8A6', onPrimary: '#1C1814', primaryPressed: '#4A9E8D', secondary: '#E49272', onSecondary: '#1C1814' },
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
