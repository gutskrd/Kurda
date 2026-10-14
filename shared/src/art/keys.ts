/**
 * What there is art for: the badge catalogue's keys and families, the badge
 * tiers, the game-rank tiers and the league tiers (contract 4, B1/B3, R4, L1;
 * research §7.4).
 *
 * The badge catalogue proper — thresholds, what counts, the translated names —
 * belongs to `shared/src/badges.ts`, written by the badges track at the same
 * time as this. The art cannot wait for it, so this is the art's own copy of
 * the list: the 43 badge types under the names the research gives them,
 * folded to ASCII for a key. When both exist, `badges.ts` should take its keys
 * from here (or this should import them from there), and the art test that
 * every catalogue key has a drawing then covers both.
 *
 * Names here are labels for the drawings' default `<title>` only. Every app
 * passes its own translated title; these are the fallback.
 */

export const BADGE_FAMILIES = ['learning', 'habit', 'games', 'ranked', 'friends', 'events', 'secret'] as const;
export type BadgeFamily = (typeof BADGE_FAMILIES)[number];

/** Badge tiers 1–4: Sifir (copper), Zîv (silver), Zêr (gold), Firûze (turquoise). */
export const BADGE_TIERS = [1, 2, 3, 4] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];
export const BADGE_TIER_NAMES: Record<BadgeTier, string> = { 1: 'Sifir', 2: 'Zîv', 3: 'Zêr', 4: 'Firûze' };

/** Game-rank tiers, lowest first (R4). */
export const RANK_TIERS = ['dest', 'gir', 'zozan', 'ciya', 'lutke', 'sterk'] as const;
export type RankTier = (typeof RANK_TIERS)[number];
export const RANK_TIER_NAMES: Record<RankTier, { ku: string; en: string }> = {
  dest: { ku: 'Deşt', en: 'Plain' },
  gir: { ku: 'Gir', en: 'Hill' },
  zozan: { ku: 'Zozan', en: 'High pasture' },
  ciya: { ku: 'Çiya', en: 'Mountain' },
  lutke: { ku: 'Lûtke', en: 'Summit' },
  sterk: { ku: 'Stêrk', en: 'Star' },
};
/** Divisions within a tier: 3 is III (the lowest), 1 is I (the top). Stêrk has none. */
export const RANK_DIVISIONS = [3, 2, 1] as const;
export type RankDivision = (typeof RANK_DIVISIONS)[number];

/** The seasons, in calendar order: Q1 Zivistan, Q2 Bihar, Q3 Havîn, Q4 Payîz (R5). */
export const SEASONS = ['zivistan', 'bihar', 'havin', 'payiz'] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_NAMES: Record<Season, { ku: string; en: string }> = {
  zivistan: { ku: 'Zivistan', en: 'Winter' },
  bihar: { ku: 'Bihar', en: 'Spring' },
  havin: { ku: 'Havîn', en: 'Summer' },
  payiz: { ku: 'Payîz', en: 'Autumn' },
};

/** Learning-league tiers, lowest first (L1). */
export const LEAGUE_TIERS = ['dilop', 'kani', 'cem', 'gol', 'derya', 'okyanus'] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];
export const LEAGUE_TIER_NAMES: Record<LeagueTier, { ku: string; en: string }> = {
  dilop: { ku: 'Dilop', en: 'Drop' },
  kani: { ku: 'Kanî', en: 'Spring' },
  cem: { ku: 'Çem', en: 'River' },
  gol: { ku: 'Gol', en: 'Lake' },
  derya: { ku: 'Derya', en: 'Sea' },
  okyanus: { ku: 'Okyanûs', en: 'Ocean' },
};

interface BadgeDef {
  family: BadgeFamily;
  /** Kurmancî name, for the default title */
  name: string;
  /** how many tiers the research gives it; 1 = a single badge with no tier pips */
  tiers: 1 | 4;
}

/**
 * The 43 badge types (research §7.4): 7 learning, 4 habit, 7 games, 8 ranked,
 * 3 friends, 8 events, 6 secret.
 */
export const BADGES = {
  // A. Learning — circle
  ders: { family: 'learning', name: 'Ders', tiers: 4 },
  'peyven-min': { family: 'learning', name: 'Peyvên min', tiers: 4 },
  bekemasi: { family: 'learning', name: 'Bêkêmasî', tiers: 4 },
  dubare: { family: 'learning', name: 'Dubare', tiers: 4 },
  cirokbej: { family: 'learning', name: 'Çîrokbêj', tiers: 4 },
  rewi: { family: 'learning', name: 'Rêwî', tiers: 4 },
  alfabe: { family: 'learning', name: 'Alfabe', tiers: 1 },
  // B. Habit — rounded square
  agir: { family: 'habit', name: 'Agir', tiers: 4 },
  hefte: { family: 'habit', name: 'Hefte', tiers: 4 },
  roj: { family: 'habit', name: 'Roj', tiers: 4 },
  vegera: { family: 'habit', name: 'Vegera', tiers: 1 },
  // C. Games — hexagon
  peyvzan: { family: 'games', name: 'Peyvzan', tiers: 4 },
  helbestvan: { family: 'games', name: 'Helbestvan', tiers: 4 },
  bilez: { family: 'games', name: 'Bilez', tiers: 4 },
  rastnivis: { family: 'games', name: 'Rastnivîs', tiers: 4 },
  guhdar: { family: 'games', name: 'Guhdar', tiers: 4 },
  hemereng: { family: 'games', name: 'Hemereng', tiers: 1 },
  dilpak: { family: 'games', name: 'Dilpak', tiers: 4 },
  // D. Ranked — shield; one emblem per tier reached, plus two
  'rank-dest': { family: 'ranked', name: 'Deşt', tiers: 1 },
  'rank-gir': { family: 'ranked', name: 'Gir', tiers: 1 },
  'rank-zozan': { family: 'ranked', name: 'Zozan', tiers: 1 },
  'rank-ciya': { family: 'ranked', name: 'Çiya', tiers: 1 },
  'rank-lutke': { family: 'ranked', name: 'Lûtke', tiers: 1 },
  'rank-sterk': { family: 'ranked', name: 'Stêrk', tiers: 1 },
  hilkiser: { family: 'ranked', name: 'Hilkişer', tiers: 1 },
  placed: { family: 'ranked', name: 'Placed', tiers: 1 },
  // E. Friends — leaf
  heval: { family: 'friends', name: 'Heval', tiers: 4 },
  diyari: { family: 'friends', name: 'Diyarî', tiers: 4 },
  alikar: { family: 'friends', name: 'Alîkar', tiers: 4 },
  // F. Events — eight-point star
  'agire-newroze': { family: 'events', name: 'Agirê Newrozê', tiers: 1 },
  'roja-zimane-kurdi': { family: 'events', name: 'Roja Zimanê Kurdî', tiers: 1 },
  'zimane-dayike': { family: 'events', name: 'Zimanê Dayikê', tiers: 1 },
  bihar: { family: 'events', name: 'Bihar', tiers: 1 },
  havin: { family: 'events', name: 'Havîn', tiers: 1 },
  payiz: { family: 'events', name: 'Payîz', tiers: 1 },
  zivistan: { family: 'events', name: 'Zivistan', tiers: 1 },
  mehane: { family: 'events', name: 'Mehane', tiers: 1 },
  // G. Secret — diamond
  'tire-rast': { family: 'secret', name: 'Tîrê rast', tiers: 1 },
  'ji-nu-ve': { family: 'secret', name: 'Ji nû ve', tiers: 1 },
  'kewe-ciye': { family: 'secret', name: 'Kewê çiyê', tiers: 1 },
  'deste-zerin': { family: 'secret', name: 'Destê zêrîn', tiers: 1 },
  'mevane-agir': { family: 'secret', name: 'Mêvanê agir', tiers: 1 },
  'kaniya-zanine': { family: 'secret', name: 'Kanîya zanînê', tiers: 1 },
} as const satisfies Record<string, BadgeDef>;

export type BadgeKey = keyof typeof BADGES;
export const BADGE_KEYS = Object.keys(BADGES) as BadgeKey[];

export function isBadgeKey(key: string): key is BadgeKey {
  return Object.prototype.hasOwnProperty.call(BADGES, key);
}

/** The ranked family's six tier badges, by the rank tier they show. */
export const RANK_BADGE: Record<RankTier, BadgeKey> = {
  dest: 'rank-dest',
  gir: 'rank-gir',
  zozan: 'rank-zozan',
  ciya: 'rank-ciya',
  lutke: 'rank-lutke',
  sterk: 'rank-sterk',
};
