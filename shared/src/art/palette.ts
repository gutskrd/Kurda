/**
 * The colours the badges, emblems and frames are made of.
 *
 * Everything is outlined in one ink, the deep plum the shop's icons are
 * outlined in, so a badge, an emblem and a sticker sit together. That outline
 * is also what keeps a pale silver badge from vanishing on the light theme;
 * the metals' bright tops are what keep it from vanishing on the dark one.
 *
 * A metal is five steps from its highlight to its shadow. The badge tiers'
 * middle steps are the research's colours exactly (Sifir #B87333, Zîv #C0C7CF,
 * Zêr #E2B33C, Firûze #2BB3A8); the rest are lit and shaded from them.
 */
import type { BadgeFamily, BadgeTier, LeagueTier, RankTier } from './keys.js';

export const INK = '#22122f';

export interface Metal {
  hi: string;
  light: string;
  mid: string;
  dark: string;
  deep: string;
}

export const COPPER: Metal = { hi: '#ffe0c4', light: '#e9a46e', mid: '#b87333', dark: '#7a4519', deep: '#3f200b' };
export const SILVER: Metal = { hi: '#ffffff', light: '#e7ebf0', mid: '#c0c7cf', dark: '#7d8794', deep: '#353c47' };
export const GOLD: Metal = { hi: '#fff6cf', light: '#f7d774', mid: '#e2b33c', dark: '#a5741a', deep: '#4f3308' };
export const TURQUOISE: Metal = { hi: '#dcfffa', light: '#82e8dc', mid: '#2bb3a8', dark: '#167a72', deep: '#063b37' };
/** What a badge not yet earned is drawn in. */
export const STONE: Metal = { hi: '#c9ccd2', light: '#a7abb3', mid: '#8a8f99', dark: '#5f636b', deep: '#2e3036' };
/** The secret slot's dim violet-silver. */
export const SHADOW: Metal = { hi: '#e6dcff', light: '#b3a3d9', mid: '#7f6fae', dark: '#4e4276', deep: '#1c1530' };

export const TIER_METAL: Record<BadgeTier, Metal> = { 1: COPPER, 2: SILVER, 3: GOLD, 4: TURQUOISE };

/**
 * The woven border's dyes, for the tiers that have one: a ground, the motif,
 * and a dot of madder red at the heart of each motif the way kilims are dotted.
 * Firûze is turquoise inlaid with gold wire.
 */
export const KILIM: Partial<Record<BadgeTier, { ground: string; motif: Metal; dot: string }>> = {
  3: { ground: '#6b4510', motif: GOLD, dot: '#c2263f' },
  4: { ground: '#0b4d47', motif: GOLD, dot: '#c2263f' },
};

/** Each family's enamel: the field the icon sits on. */
export const ENAMEL: Record<BadgeFamily, { light: string; deep: string }> = {
  learning: { light: '#6e44a8', deep: '#211036' },
  habit: { light: '#b4502c', deep: '#3a130b' },
  games: { light: '#3466b4', deep: '#0e1b3a' },
  ranked: { light: '#46536e', deep: '#121826' },
  friends: { light: '#2f9160', deep: '#0b2a1a' },
  events: { light: '#b8344f', deep: '#360a18' },
  secret: { light: '#45337a', deep: '#0c0720' },
};

/** Named colours an icon may use besides its metal. Each is [light, dark] for a top-lit fill. */
export const ACCENT = {
  fire: ['#ffd25a', '#e8542b'],
  flame: ['#fff3b0', '#ffb43a'],
  red: ['#ff6b6b', '#c21f3a'],
  green: ['#8fe07a', '#2e9a4a'],
  leaf: ['#b8e986', '#4c9a2a'],
  gold: ['#ffe58a', '#e0a526'],
  blue: ['#8cc8ff', '#2f6fd0'],
  water: ['#bff3ff', '#2aa5d6'],
  pink: ['#ffd1dc', '#f07a9a'],
  autumn: ['#ffc15a', '#d2462b'],
  tea: ['#f39a5a', '#9a2d12'],
  glow: ['#fffbe0', '#ffd45c'],
  snow: ['#ffffff', '#dfe8f2'],
  brown: ['#c98b5a', '#7a4a26'],
} as const;
export type AccentName = keyof typeof ACCENT;

// ───────────────────────────────────────────────────────────── game ranks

/**
 * Rank tiers climb in colour as they climb in height: the ochre of a harvested
 * plain, the green of a hill, the teal of a high pasture, a mountain's slate
 * blue, the violet of a summit at dusk, and gold for the star above it.
 */
export const RANK_METAL: Record<RankTier, Metal> = {
  dest: { hi: '#fbe6b8', light: '#dcb46e', mid: '#b38a48', dark: '#755a2a', deep: '#3a2c13' },
  gir: { hi: '#dff7cc', light: '#9fd884', mid: '#5aa04e', dark: '#336e2e', deep: '#163a17' },
  zozan: { hi: '#d2f7ee', light: '#74d6c2', mid: '#2a9d8f', dark: '#186b61', deep: '#0a3833' },
  ciya: { hi: '#dce8ff', light: '#95b4f2', mid: '#4f74bd', dark: '#2c4785', deep: '#121f45' },
  lutke: { hi: '#f3e3ff', light: '#cfa6f7', mid: '#8f5fdb', dark: '#5a3399', deep: '#26123f' },
  sterk: { hi: '#fff6cf', light: '#fbd96a', mid: '#f2b632', dark: '#b07a12', deep: '#4f3308' },
};

/** Each rank tier's sky: [top, horizon]. */
export const RANK_SKY: Record<RankTier, readonly [string, string]> = {
  dest: ['#f7c97a', '#ffe9c2'],
  gir: ['#7cc6f0', '#d9f1ff'],
  zozan: ['#5aa9e6', '#c8ecf5'],
  ciya: ['#3c63b8', '#a9c6f2'],
  lutke: ['#3a2370', '#d58ab8'],
  sterk: ['#0d0b2e', '#3b2a78'],
};

// ──────────────────────────────────────────────────────── learning leagues

/** Water deepens tier by tier: a pale drop to the ocean's indigo. */
export const LEAGUE_METAL: Record<LeagueTier, Metal> = {
  dilop: { hi: '#f2fbff', light: '#c6e3f2', mid: '#8fb6cc', dark: '#57788c', deep: '#243440' },
  kani: { hi: '#dbfff4', light: '#86e3c9', mid: '#38b393', dark: '#1d7660', deep: '#0b392e' },
  cem: { hi: '#dff1ff', light: '#8ccaf5', mid: '#3d8fd6', dark: '#215e99', deep: '#0d2a4a' },
  gol: { hi: '#d9fbff', light: '#7fd6e6', mid: '#2496ad', dark: '#14627a', deep: '#072e3b' },
  derya: { hi: '#fff6cf', light: '#f7d774', mid: '#e2b33c', dark: '#a5741a', deep: '#4f3308' },
  okyanus: { hi: '#dcfffa', light: '#82e8dc', mid: '#2bb3a8', dark: '#167a72', deep: '#063b37' },
};

/** The water inside each league emblem: [surface, depth]. */
export const LEAGUE_WATER: Record<LeagueTier, readonly [string, string]> = {
  dilop: ['#cdeefc', '#5fb2dc'],
  kani: ['#bff5e6', '#2f9f8e'],
  cem: ['#a9dcff', '#2a6fc0'],
  gol: ['#9ee3ee', '#176f8f'],
  derya: ['#6fb4ef', '#16357e'],
  okyanus: ['#4fd4d0', '#1a1f6e'],
};
