/**
 * The colours the badges, emblems and frames are made of.
 *
 * Everything is painted like an enamel pin: a metal rim and coloured enamel
 * inside it. A metal is five steps — a near-white highlight, a light, the hue
 * itself, a deep shade and the darkest tone — and a rim is lit from those
 * alone, light at its upper left running to shade at its lower right. There is
 * no outline in a foreign ink: what separates a piece from the page is its own
 * darkest tone, which keeps a pale tier from vanishing on the light theme,
 * and its own light rim is what lifts it off the dark one.
 *
 * Shadows lean toward the hue rather than toward grey, so a piece stays warm
 * as it darkens.
 */
import type { BadgeTier, LeagueTier, RankTier } from './keys.js';

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

/** A field, the enamel ground a glyph glows on: `glow` at the heart, `mid` around it, `deep` at the rim. */
export interface Field {
  glow: string;
  mid: string;
  deep: string;
}

/**
 * The plates a badge's picture stands on: vivid, each badge its own, so a
 * page of them is as bright as a box of paints. `top` to `bottom` is the
 * face lit from above, `rim` the lighter line just inside its edge, `deep`
 * the darkest tone — the plate's thickness, the outline round the picture
 * and the edge of the number.
 */
export interface Plate {
  top: string;
  bottom: string;
  rim: string;
  deep: string;
}

export const PLATES = {
  violet: { top: '#a77bff', bottom: '#6a3de8', rim: '#dccbff', deep: '#341478' },
  blue: { top: '#5aaeff', bottom: '#2c6fe0', rim: '#cde6ff', deep: '#123a85' },
  sky: { top: '#4fd8f5', bottom: '#169ccc', rim: '#c9f5ff', deep: '#0a4a6a' },
  teal: { top: '#3fdcc0', bottom: '#11a08c', rim: '#c8f8ee', deep: '#074a42' },
  green: { top: '#6ddb76', bottom: '#27a24c', rim: '#d3f8d6', deep: '#0c5426' },
  gold: { top: '#ffd24a', bottom: '#f39a12', rim: '#fff1c4', deep: '#7a4100' },
  orange: { top: '#ffa45a', bottom: '#ee6320', rim: '#ffe2cc', deep: '#7c2a06' },
  red: { top: '#ff6b78', bottom: '#dc2a47', rim: '#ffd3d9', deep: '#700c24' },
  pink: { top: '#ff8cc8', bottom: '#e0479b', rim: '#ffdaee', deep: '#6e1042' },
  indigo: { top: '#8487ff', bottom: '#4c4bd8', rim: '#d8daff', deep: '#22266e' },
  night: { top: '#4b36a8', bottom: '#150a48', rim: '#8f7be0', deep: '#0b0530' },
} as const satisfies Record<string, Plate>;
export type PlateName = keyof typeof PLATES;

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
 * Rank tiers climb from the warm earth of the plain to the sky: the clay and
 * terracotta of Deşt, Gir's fresh spring green, the turquoise of a high
 * pasture's streams, Çiya's deep sapphire, Lûtke's amethyst at dusk, and
 * Stêrk's gold. Neighbours never share a hue, and the light steps of the
 * upper tiers are paler, so the ladder also reads as getting brighter.
 */
export const RANK_METAL: Record<RankTier, Metal> = {
  dest: { hi: '#ffe9dc', light: '#f6ad86', mid: '#dc7a52', dark: '#a94c30', deep: '#55220f' },
  gir: { hi: '#eeffdc', light: '#a6e58c', mid: '#4fba5c', dark: '#2a8a44', deep: '#0f4424' },
  zozan: { hi: '#e0fffa', light: '#86ebdd', mid: '#22c2b2', dark: '#118a86', deep: '#06474a' },
  ciya: { hi: '#e8f0ff', light: '#97b8ff', mid: '#3f71e6', dark: '#2446a6', deep: '#0e1f5c' },
  lutke: { hi: '#f7ecff', light: '#d2acf7', mid: '#9d66e0', dark: '#6b3cb0', deep: '#311660' },
  sterk: { hi: '#fffbe8', light: '#ffe58e', mid: '#f7c235', dark: '#cc8d10', deep: '#6a4204' },
};

/**
 * The stone set in each rank's crest: the tier's hue as a cut jewel, deeper
 * and more saturated than its metal so it stands out of its own setting —
 * carnelian for the plain, emerald for the hills, turquoise for the pasture,
 * sapphire for the mountain, amethyst for the summit, and for the star a
 * stone of starlight — ice-blue and white in its gold, the one crest whose
 * stone is not its metal's colour, so the top of the ladder is unmistakable.
 */
export const RANK_GEM: Record<RankTier, Metal> = {
  dest: { hi: '#fff0e2', light: '#ffb07c', mid: '#ef6a34', dark: '#a8341b', deep: '#4a1408' },
  gir: { hi: '#ecfff1', light: '#86f0a6', mid: '#22c063', dark: '#0d7a3e', deep: '#04321a' },
  zozan: { hi: '#e8fffc', light: '#74f2e4', mid: '#13c3bd', dark: '#077e86', deep: '#033a42' },
  ciya: { hi: '#ecf2ff', light: '#93b5ff', mid: '#3a6aff', dark: '#1b37b8', deep: '#0a1556' },
  lutke: { hi: '#f8eeff', light: '#d9a2ff', mid: '#a650f2', dark: '#6522b2', deep: '#2c0b5c' },
  sterk: { hi: '#ffffff', light: '#e6f6ff', mid: '#9fd4ff', dark: '#4688e0', deep: '#13357a' },
};

/**
 * The enamel behind a rank tier's glyph where one is drawn on a badge, and
 * under its season plaque: the tier's hue gone deep, never toward brown.
 */
export const RANK_FIELD: Record<RankTier, Field> = {
  dest: { glow: '#c2603a', mid: '#8a3820', deep: '#3e170b' },
  gir: { glow: '#3b9a4c', mid: '#1f6a34', deep: '#0b3119' },
  zozan: { glow: '#169c93', mid: '#0b6a68', deep: '#053536' },
  ciya: { glow: '#2f5fd0', mid: '#1b3a96', deep: '#0b1a4c' },
  lutke: { glow: '#7d48c4', mid: '#522a8c', deep: '#26114a' },
  sterk: { glow: '#d99a1c', mid: '#9a620a', deep: '#4a2c03' },
};

/** The placement emblem's pearl, neutral until a tier is earned. */
export const PEARL: Metal = { hi: '#ffffff', light: '#eef0f5', mid: '#c9cfda', dark: '#8d96a8', deep: '#434b5c' };

/** The placement count's violet: Hevalo's own, the one colour the placing emblem counts in. */
export const PLACING: Metal = { hi: '#f6ecff', light: '#e3c4ff', mid: '#b874f0', dark: '#6b3fa0', deep: '#2a1250' };

// ──────────────────────────────────────────────────────── learning leagues

/**
 * Each league's own water, the colour of its picture and of everything an app
 * draws around its emblem: a pale dew-blue drop, a fresh mint spring, an
 * azure river, a still lake gone cobalt-lilac at dusk, a sea-teal under a
 * sunrise (its highlight is the rising sun's peach), and the ocean's
 * midnight, which glows with living light (`glint` is that bioluminescent edge).
 */
export const LEAGUE_METAL: Record<LeagueTier, Metal & { glint: string }> = {
  dilop: { hi: '#ffffff', light: '#d4f1ff', mid: '#8fd2f7', dark: '#3a8ed6', deep: '#0f3570', glint: '#ffffff' },
  kani: { hi: '#eafff4', light: '#9cf5cf', mid: '#2fd3a2', dark: '#0d917a', deep: '#043f3a', glint: '#d6ffea' },
  cem: { hi: '#e3f6ff', light: '#86d3ff', mid: '#2a9df5', dark: '#1460c4', deep: '#082a66', glint: '#bdf0ff' },
  gol: { hi: '#f1eeff', light: '#bdb6ff', mid: '#7a6ff2', dark: '#4639c4', deep: '#16105e', glint: '#e0d8ff' },
  derya: { hi: '#fff1db', light: '#7fe3e6', mid: '#119fae', dark: '#0a5f86', deep: '#042a4a', glint: '#ffc98a' },
  okyanus: { hi: '#d6fff8', light: '#5ff5df', mid: '#16b8d0', dark: '#123f9e', deep: '#070a3a', glint: '#4dffd8' },
};

/**
 * The rim each league's water is set in, rising in worth the way the water
 * deepens: pearl, silver, gold, rose gold, platinum, and for the ocean a
 * mother-of-pearl rim that runs through the colours of a shell's lining.
 * The pearl and the mother-of-pearl have a `sheen`: the colours their lustre
 * runs through, light to shade. The ladder reads at a glance even where the pictures are too
 * small to see.
 */
export const LEAGUE_RIM: Record<LeagueTier, Metal & { sheen?: readonly string[] }> = {
  dilop: { hi: '#ffffff', light: '#f5eff6', mid: '#ddd2cc', dark: '#a8978f', deep: '#5d4f4c', sheen: ['#ffffff', '#f7f1fb', '#eae9f6', '#f3e7df', '#d9cbc4', '#a99a92'] },
  kani: { hi: '#ffffff', light: '#e9eef4', mid: '#bfc8d4', dark: '#86919f', deep: '#3d4553' },
  cem: { hi: '#fff7d6', light: '#ffe28a', mid: '#f3bd3a', dark: '#c5871a', deep: '#5f3c08' },
  gol: { hi: '#fff1ec', light: '#f8cbbb', mid: '#e39b87', dark: '#b0645a', deep: '#5a2b2b' },
  derya: { hi: '#ffffff', light: '#e4effa', mid: '#b4c8df', dark: '#6f86a5', deep: '#24344d' },
  okyanus: {
    hi: '#ffffff',
    light: '#d4f7ff',
    mid: '#a9b8ff',
    dark: '#5d55c2',
    deep: '#1f1f5c',
    sheen: ['#e6fdff', '#bdf3ff', '#d8c9ff', '#ffd0ec', '#fff0c4', '#b3f2e2', '#8fa4f0'],
  },
};
