/**
 * The colours the badges, emblems and frames are made of.
 *
 * One hero hue per thing, lit from within. A hue is five steps — a near-white
 * highlight, a light, the hue itself, a deep shade and the darkest tone — and
 * a piece is painted from those alone: its lit facets from the top two, its
 * shaded facets from the bottom two, its edge from the darkest. There is no
 * outline in a foreign ink: what separates a piece from the page is its own
 * darkest tone, which is what keeps a pale tier from vanishing on the light
 * theme, and its glow and highlight are what lift it off the dark one.
 *
 * Shadows lean cool and violet, highlights lean warm or toward white, so the
 * tones stay clean instead of going grey or brown as they darken.
 */
import type { BadgeFamily, BadgeTier, LeagueTier, RankTier } from './keys.js';

export interface Metal {
  hi: string;
  light: string;
  mid: string;
  dark: string;
  deep: string;
}

/**
 * Badge tiers. Sifir is a rose copper, Zîv a cool blue silver, Zêr a rich warm
 * gold and Firûze an electric turquoise — the research's four (#B87333,
 * #C0C7CF, #E2B33C, #2BB3A8) brightened into light rather than polished metal.
 */
export const COPPER: Metal = { hi: '#ffe6d6', light: '#ffb48e', mid: '#ee7b52', dark: '#b2472d', deep: '#5a1d16' };
export const SILVER: Metal = { hi: '#ffffff', light: '#e4edf8', mid: '#b3c4dc', dark: '#6c80a6', deep: '#2a3456' };
export const GOLD: Metal = { hi: '#fff8d1', light: '#ffe16a', mid: '#ffbd1f', dark: '#d9800b', deep: '#6b3500' };
export const TURQUOISE: Metal = { hi: '#e2fffb', light: '#72f6e6', mid: '#19d2c4', dark: '#0b8f9a', deep: '#063f52' };
/** What a badge not yet earned is drawn in: a neutral that reads on both themes. */
export const STONE: Metal = { hi: '#d5d9e2', light: '#b1b7c4', mid: '#8a91a1', dark: '#5f6676', deep: '#30343e' };
/** The secret slot's midnight violet. */
export const SHADOW: Metal = { hi: '#f1eaff', light: '#c9b5ff', mid: '#8f70f0', dark: '#4f34b0', deep: '#1a0e45' };

export const TIER_METAL: Record<BadgeTier, Metal> = { 1: COPPER, 2: SILVER, 3: GOLD, 4: TURQUOISE };

/**
 * Each family's field, the ground its glyph glows on: `glow` at the heart,
 * `mid` around it, `deep` at the rim. Learning is Hevalo's own violet; habit
 * is ember, for the streak's fire; games are azure; ranked a night indigo;
 * friends emerald; events the red of Newroz; secrets midnight. Red, gold and
 * green turn up across the set the way they do in a Newroz crowd — never side
 * by side as stripes.
 */
export interface Field {
  glow: string;
  mid: string;
  deep: string;
}

export const FIELD: Record<BadgeFamily, Field> = {
  learning: { glow: '#7e48f0', mid: '#4a1fb8', deep: '#1d0a52' },
  habit: { glow: '#c8401a', mid: '#8f220c', deep: '#420b05' },
  games: { glow: '#2462d4', mid: '#143fa6', deep: '#081a52' },
  ranked: { glow: '#5148e0', mid: '#28239a', deep: '#0d0b3e' },
  friends: { glow: '#0c8a52', mid: '#06603c', deep: '#022b1a' },
  events: { glow: '#e8264f', mid: '#a80e35', deep: '#480416' },
  secret: { glow: '#5a3ad8', mid: '#2a1580', deep: '#0b0530' },
};

/** Named colours an icon may use besides its metal. Each is [top, bottom] of a lit fill. */
export const ACCENT = {
  fire: ['#fff07a', '#ff7a1a'],
  flame: ['#ffffff', '#ffe36b'],
  red: ['#ff8a9a', '#ff2d55'],
  green: ['#b6ff8a', '#2fd16b'],
  leaf: ['#e4ff9a', '#7ed957'],
  gold: ['#fff3a0', '#ffc21f'],
  blue: ['#c6ecff', '#4fb6ff'],
  violet: ['#f0d9ff', '#b57bff'],
  water: ['#d4fbff', '#3fc8f5'],
  pink: ['#ffe3ee', '#ff8fbd'],
  autumn: ['#ffd36b', '#ff6a2a'],
  tea: ['#ffb27a', '#e0441f'],
  glow: ['#ffffff', '#ffe27a'],
  snow: ['#ffffff', '#e2ecff'],
  brown: ['#ffcf9a', '#d27a3c'],
} as const;
export type AccentName = keyof typeof ACCENT;

// ───────────────────────────────────────────────────────────── game ranks

/**
 * Rank tiers climb in light as they climb in height: the warm sand and amber
 * of the plain, a fresh hill green, the aqua of a high pasture's streams, a
 * mountain's ice blue going to indigo, a summit's violet going to magenta at
 * dusk, and Stêrk's gold burning to white.
 */
export const RANK_METAL: Record<RankTier, Metal> = {
  dest: { hi: '#fff4d6', light: '#ffd58a', mid: '#f4a63a', dark: '#bd6a12', deep: '#5c2c04' },
  gir: { hi: '#ecffd9', light: '#9ff58f', mid: '#36d46e', dark: '#0f9450', deep: '#043f27' },
  zozan: { hi: '#dcfffb', light: '#7df5e6', mid: '#17c9c0', dark: '#0a8494', deep: '#043a4d' },
  ciya: { hi: '#eaf4ff', light: '#9ccaff', mid: '#4f86ff', dark: '#2f3fd0', deep: '#14196a' },
  lutke: { hi: '#fdeaff', light: '#f2a6ff', mid: '#c552ff', dark: '#b4249e', deep: '#3a0850' },
  sterk: { hi: '#ffffff', light: '#fff2a8', mid: '#ffcf3a', dark: '#f08c0a', deep: '#6e3300' },
};

/**
 * The ground inside each rank crest: the tier's hue gone deep and saturated,
 * never toward brown. Deşt's sand glows on a sunset running from ember to
 * plum; Stêrk's gold burns on a night sky, the star's own.
 */
export const RANK_FIELD: Record<RankTier, Field> = {
  dest: { glow: '#b8400e', mid: '#7a1a2a', deep: '#36081f' },
  gir: { glow: '#0d8048', mid: '#06552f', deep: '#022817' },
  zozan: { glow: '#0a7385', mid: '#064a5c', deep: '#032432' },
  ciya: { glow: '#2a44cc', mid: '#18248a', deep: '#0a0e42' },
  lutke: { glow: '#7a1fc4', mid: '#4f0d7e', deep: '#21063f' },
  sterk: { glow: '#3a2ab0', mid: '#1d166e', deep: '#090732' },
};

// ──────────────────────────────────────────────────────── learning leagues

/**
 * Water deepens tier by tier, and no two neighbours share a hue: a pale
 * dew-blue drop, a fresh mint-green spring, an azure river, a still lake gone
 * cobalt-lilac at dusk, a deep sea-teal under a sunrise (its pearl and glint
 * are the rising sun's peach), and the ocean's midnight, which glows with
 * living light (`glint` is that bioluminescent edge).
 */
export const LEAGUE_METAL: Record<LeagueTier, Metal & { glint: string }> = {
  dilop: { hi: '#ffffff', light: '#d4f1ff', mid: '#8fd2f7', dark: '#3a8ed6', deep: '#0f3570', glint: '#ffffff' },
  kani: { hi: '#eafff4', light: '#9cf5cf', mid: '#2fd3a2', dark: '#0d917a', deep: '#043f3a', glint: '#d6ffea' },
  cem: { hi: '#e3f6ff', light: '#86d3ff', mid: '#2a9df5', dark: '#1460c4', deep: '#082a66', glint: '#bdf0ff' },
  gol: { hi: '#f1eeff', light: '#bdb6ff', mid: '#7a6ff2', dark: '#4639c4', deep: '#16105e', glint: '#e0d8ff' },
  derya: { hi: '#fff1db', light: '#7fe3e6', mid: '#119fae', dark: '#0a5f86', deep: '#042a4a', glint: '#ffc98a' },
  okyanus: { hi: '#d6fff8', light: '#5ff5df', mid: '#16b8d0', dark: '#123f9e', deep: '#070a3a', glint: '#4dffd8' },
};
