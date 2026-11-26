/**
 * Hevalo's colours for both apps: a cool slate page by night and a soft clean white by day, one vivid accent that
 * carries what you press and where you are, the reward gold for what is earned, and Hevalo+'s own gold button. Most of
 * every screen is just the page; colour appears only where it matters. The website's tokens.css and the phone's
 * palette.ts read their values from here (or are tested against them).
 */
export type ThemeScheme = 'light' | 'dark';

/** The page and the flat surfaces raised from it: never pure white or black. */
export interface ThemePage {
  /** The page itself. */
  page: string;
  /** A card on the page, one step off it. */
  surface: string;
  /** Something inside a card (a chip, a field) or a sheet over the page, a second step. */
  raised: string;
  /** The third step: an outlined button's edge, a locked stop, a track. */
  high: string;
  /** Words and glyphs: cool near-white by night, dark slate by day. */
  ink: string;
  /** Secondary words: captions, times, previews. */
  inkSoft: string;
  /** The hairline round a card, from the ink's own family. */
  hairline: string;
}

export const PAGE: Readonly<Record<ThemeScheme, ThemePage>> = {
  light: { page: '#F7F9FA', surface: '#EEF2F4', raised: '#E4EAED', high: '#D6DFE3', ink: '#17242B', inkSoft: '#4F616A', hairline: 'rgba(23,36,43,0.1)' },
  dark: { page: '#131C20', surface: '#1A262B', raised: '#1F2B30', high: '#2E3C43', ink: '#EEF3F5', inkSoft: '#A3B2B9', hairline: 'rgba(238,243,245,0.1)' },
};

/**
 * The one accent: the green of the Kurdistan flag and the Zagros in spring, bright by night, deep by day, kept clear of
 * the yellow-green lime of other learning apps. It fills the main buttons and progress bars and marks a switch that is
 * on, links, focus rings and the stop to do now. What is chosen (a tab, a chip) is shown in the ink, never a colour.
 */
export interface AccentColors {
  /** The fill of a main button, a progress bar, a switch that is on. */
  fill: string;
  /** The darker lip under a main button, which it presses down into. */
  lip: string;
  /** Words and glyphs on the fill. */
  ink: string;
  /** The accent as words and marks on the page and its surfaces: a link, a focus ring. */
  text: string;
}

export const ACCENT: Readonly<Record<ThemeScheme, AccentColors>> = {
  light: { fill: '#00863B', lip: '#006129', ink: '#FFFFFF', text: '#007433' },
  dark: { fill: '#32D46B', lip: '#019A46', ink: '#0A2A17', text: '#32D46B' },
};

/**
 * Right and wrong answers keep colours of their own, never the accent's: a softer leaf green and a red, each with a
 * tint for the panel that says so. `text` is the colour as words on the page, `soft` the panel's ground.
 */
export const ANSWER: Readonly<Record<ThemeScheme, { right: { text: string; soft: string }; wrong: { text: string; soft: string } }>> = {
  light: { right: { text: '#3E731D', soft: 'rgba(62,115,29,0.1)' }, wrong: { text: '#B42318', soft: 'rgba(180,35,24,0.09)' } },
  dark: { right: { text: '#A0DF8A', soft: 'rgba(160,223,138,0.14)' }, wrong: { text: '#FF9C90', soft: 'rgba(255,120,105,0.16)' } },
};

/**
 * What is earned (XP, Zêr, the streak, medals): `gold` for fills and marks, `goldText` for words in gold on the page,
 * `onGold` for words on a gold fill.
 */
export const REWARD_GOLD: Readonly<Record<ThemeScheme, { gold: string; goldText: string; onGold: string }>> = {
  light: { gold: '#E3A21A', goldText: '#845A0F', onGold: '#3A2604' },
  dark: { gold: '#F2B632', goldText: '#F5C85A', onGold: '#2A1D05' },
};

/**
 * Hevalo+'s own button, the one control styled apart from the accent: a rich gold with a gold edge, so a membership
 * never looks like an ordinary next step. `fill` runs top to bottom.
 */
export const PLUS_STYLE: Readonly<Record<ThemeScheme, { fill: readonly [string, string]; edge: string; ink: string; glow: string }>> = {
  light: { fill: ['#F7CB5E', '#E3A21A'], edge: '#B97F12', ink: '#3A2604', glow: 'rgba(227,162,26,0.35)' },
  dark: { fill: ['#F8D374', '#E8A928'], edge: '#F8D98A', ink: '#2A1D05', glow: 'rgba(242,182,50,0.3)' },
};

/** The accent in one scheme. */
export function accentColors(scheme: ThemeScheme): AccentColors {
  return ACCENT[scheme];
}
