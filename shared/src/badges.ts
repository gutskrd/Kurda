/**
 * Badges (contract 4 §B): one catalogue for the API, both apps and the admin.
 *
 * Seven families, each with its own medallion shape so a badge is known
 * without its colour; up to four tiers — Sifir, Zîv, Zêr, Firûze (copper,
 * silver, gold, turquoise) — with thresholds that rise roughly geometrically,
 * so the first tier comes quickly and the last means something. Progress is
 * always counted by the server from what actually happened (lessons, games,
 * streaks, gifts, league weeks, rated games), never reported by a client.
 *
 * What is left out on purpose: nothing for staying up late, nothing for
 * spending, nothing for inviting people, and nothing only the top 1% can reach
 * outside ranked play.
 *
 * Where the research catalogue asked for something Hevalo cannot measure, it is
 * replaced by something it can (said at each one): there are no Friends Quests
 * (Heval counts games played with friends instead), no "helpful answer" marks
 * (Mêvandar counts games you hosted that others came to), and no alphabet
 * mastery record (Ferheng counts dictionary words you have reviewed). Pêla, the
 * Okyanûs trophy the leagues award (§L3), is the forty-fourth.
 *
 * Every Kurdish name is for a native speaker to check: [review].
 */

export const BADGE_FAMILIES = ['learning', 'habit', 'games', 'ranked', 'friends', 'events', 'secret'] as const;
export type BadgeFamily = (typeof BADGE_FAMILIES)[number];

/** The medallion shape of each family (drawn by `shared/src/art`). */
export const BADGE_FAMILY_SHAPE: Readonly<Record<BadgeFamily, string>> = {
  learning: 'circle',
  habit: 'rounded-square',
  games: 'hexagon',
  ranked: 'shield',
  friends: 'leaf',
  events: 'eight-point-star',
  secret: 'diamond',
};

/** Tier 1 … 4, low to high. */
export const BADGE_TIERS = ['sifir', 'ziv', 'zer', 'firuze'] as const;
export type BadgeTierKey = (typeof BADGE_TIERS)[number];

export const BADGE_TIER_META: Readonly<Record<BadgeTierKey, { nameKu: string; meaningEn: string; nameKey: string }>> = {
  sifir: { nameKu: 'Sifir', meaningEn: 'Copper', nameKey: 'badges.tier.sifir' }, // [review]
  ziv: { nameKu: 'Zîv', meaningEn: 'Silver', nameKey: 'badges.tier.ziv' }, // [review]
  zer: { nameKu: 'Zêr', meaningEn: 'Gold', nameKey: 'badges.tier.zer' }, // [review]
  firuze: { nameKu: 'Firûze', meaningEn: 'Turquoise', nameKey: 'badges.tier.firuze' }, // [review]
};

/** What a progress number counts, so a bar can say "7 / 30 days". */
export type BadgeUnit =
  | 'lessons'
  | 'words'
  | 'reviews'
  | 'stories'
  | 'units'
  | 'days'
  | 'weeks'
  | 'wins'
  | 'wpm'
  | 'races'
  | 'games'
  | 'gifts'
  | 'seasons'
  | 'years'
  | 'months'
  | 'times';

/**
 * A threshold is a number, or `'all'` for "every unit of the course" — a number
 * only the server knows (`resolveThresholds`).
 */
export type BadgeThreshold = number | 'all';

export interface BadgeDef {
  key: string;
  family: BadgeFamily;
  /** what each tier needs, low to high; one entry for a badge with a single tier */
  tiers: readonly BadgeThreshold[];
  /** hidden until earned ("???"), with a hint once the learner has found any secret */
  secret: boolean;
  /** the Kurmancî name [review] */
  nameKu: string;
  /** what it means, in English */
  meaningEn: string;
  nameKey: string;
  descKey: string;
  howKey: string;
  /** secrets only: the hint shown once one secret has been found */
  hintKey?: string;
  /** what the server counts (see the API's evaluators) */
  measure: string;
  unit: BadgeUnit;
}

const keys = (key: string) => ({
  nameKey: `badges.${key}.name`,
  descKey: `badges.${key}.desc`,
  howKey: `badges.${key}.how`,
});

function badge(
  key: string,
  family: BadgeFamily,
  nameKu: string,
  meaningEn: string,
  tiers: readonly BadgeThreshold[],
  measure: string,
  unit: BadgeUnit,
  opts: { secret?: boolean } = {},
): BadgeDef {
  const secret = opts.secret ?? false;
  return {
    key,
    family,
    tiers,
    secret,
    nameKu,
    meaningEn,
    ...keys(key),
    ...(secret ? { hintKey: `badges.${key}.hint` } : {}),
    measure,
    unit,
  };
}

/** Ranked emblems: seasons in which a tier was reached, in any game. */
const SEASON_COUNTS = [1, 2, 4, 8] as const;
/** Dated event badges: the distinct years taken part. */
const YEAR_COUNTS = [1, 2, 3, 5] as const;

export const BADGES: readonly BadgeDef[] = [
  // A. Learning (circle)
  badge('ders', 'learning', 'Ders', 'Lessons', [10, 50, 200, 500], 'lessons_completed', 'lessons'), // [review]
  // "words learned": an item in your review deck — a word, or a phrase from a
  // lesson — that you have remembered at least twice, days apart (SM-2's
  // second interval). Review items are exercises as often as words, so this is
  // the honest name for what is counted.
  badge('peyven-min', 'learning', 'Peyvên min', 'My words', [50, 250, 1000, 3000], 'review_items_remembered', 'words'), // [review]
  badge('bekemasi', 'learning', 'Bêkêmasî', 'Flawless', [5, 25, 100, 300], 'perfect_lessons', 'lessons'), // [review]
  badge('dubare', 'learning', 'Dubare', 'Review', [50, 300, 1500, 5000], 'review_answers', 'reviews'), // [review]
  badge('cirokbej', 'learning', 'Çîrokbêj', 'Storyteller', [3, 15, 50, 150], 'stories_finished', 'stories'), // [review]
  badge('rewi', 'learning', 'Rêwî', 'Traveller', [1, 5, 15, 'all'], 'units_completed', 'units'), // [review]
  // replaces "Alphabet mastered": nothing records alphabet mastery
  badge('ferheng', 'learning', 'Ferheng', 'Dictionary', [10, 50, 200, 500], 'dictionary_words_reviewed', 'words'), // [review]

  // B. Habit (rounded square)
  badge('agir', 'habit', 'Agir', 'Fire', [7, 30, 100, 365], 'longest_streak', 'days'), // [review]
  badge('hefte', 'habit', 'Hefte', 'Week', [4, 12, 26, 52], 'weekly_goals_met', 'weeks'), // [review]
  badge('roj', 'habit', 'Roj', 'Days', [30, 100, 250, 500], 'learning_days', 'days'), // [review]
  // a return after 14 or more days away: no shame in a break, only welcome back
  badge('vegera', 'habit', 'Vegera', 'Return', [1], 'comebacks', 'times'), // [review]
  // the Okyanûs trophy (§L3): a top-three week in an Okyanûs group, goal met
  badge('pela', 'habit', 'Pêla', 'Wave', [1, 3, 10, 25], 'okyanus_top_three_weeks', 'weeks'), // [review]

  // C. Games (hexagon)
  badge('peyvzan', 'games', 'Peyvzan', 'Word-knower', [5, 25, 100, 400], 'wordle_battle_wins', 'wins'), // [review]
  badge('helbestvan', 'games', 'Helbestvan', 'Poet', [5, 25, 100, 400], 'rhyme_match_wins', 'wins'), // [review]
  badge('bilez', 'games', 'Bilez', 'Fast', [20, 35, 50, 70], 'race_best_wpm', 'wpm'), // [review]
  // the non-speed route through typing: accuracy, at any speed
  badge('rastnivis', 'games', 'Rastnivîs', 'Accurate writer', [10, 50, 200, 500], 'races_98_percent', 'races'), // [review]
  badge('guhdar', 'games', 'Guhdar', 'Listener', [3, 15, 50, 150], 'story_quiz_perfect', 'games'), // [review]
  // Wordle, Rhyme, the Typing Race and Stories: each played at least once
  badge('hemereng', 'games', 'Hemereng', 'All colours', [4], 'games_tried', 'games'), // [review]
  badge('dilpak', 'games', 'Dilpak', 'Pure-hearted', [50, 150, 400, 1000], 'fair_rated_games', 'games'), // [review]

  // D. Ranked (shield): kept forever
  badge('rank-dest', 'ranked', 'Deşt', 'Plain', SEASON_COUNTS, 'seasons_reached_dest', 'seasons'), // [review]
  badge('rank-gir', 'ranked', 'Gir', 'Hill', SEASON_COUNTS, 'seasons_reached_gir', 'seasons'), // [review]
  badge('rank-zozan', 'ranked', 'Zozan', 'High pasture', SEASON_COUNTS, 'seasons_reached_zozan', 'seasons'), // [review]
  badge('rank-ciya', 'ranked', 'Çiya', 'Mountain', SEASON_COUNTS, 'seasons_reached_ciya', 'seasons'), // [review]
  badge('rank-lutke', 'ranked', 'Lûtke', 'Summit', SEASON_COUNTS, 'seasons_reached_lutke', 'seasons'), // [review]
  badge('rank-sterk', 'ranked', 'Stêrk', 'Star', SEASON_COUNTS, 'seasons_reached_sterk', 'seasons'), // [review]
  badge('hilkiser', 'ranked', 'Hilkişer', 'Climber', SEASON_COUNTS, 'seasons_with_ten_rated_games', 'seasons'), // [review]
  badge('cihgirti', 'ranked', 'Cihgirtî', 'Placed', [1], 'placements_finished', 'games'), // [review]

  // E. Friends (leaf)
  // replaces Friends Quests, which Hevalo does not have: a finished game with a friend in it
  badge('heval', 'friends', 'Heval', 'Friend', [1, 5, 20, 52], 'games_with_friends', 'games'), // [review]
  // a gift to one friend on one day counts once, however many are sent: it is
  // about giving, not about spending
  badge('diyari', 'friends', 'Diyarî', 'Gift', [1, 10, 50, 150], 'gift_days', 'gifts'), // [review]
  // replaces "helpful answers", which nothing marks: a game you hosted that others came to and finished
  badge('mevandar', 'friends', 'Mêvandar', 'Host', [1, 10, 50, 150], 'games_hosted', 'games'), // [review]

  // F. Events (eight-point star): dated, open at least seven days, never sold
  badge('newroz', 'events', 'Agirê Newrozê', 'Newroz fire', YEAR_COUNTS, 'learned_newroz_week', 'years'), // [review]
  badge('roja-ziman', 'events', 'Roja Zimanê Kurdî', 'Kurdish Language Day', YEAR_COUNTS, 'learned_language_day_week', 'years'), // [review]
  badge('zimane-dayike', 'events', 'Zimanê Dayikê', 'Mother Language', YEAR_COUNTS, 'learned_mother_language_week', 'years'), // [review]
  badge('zivistan', 'events', 'Zivistan', 'Winter', YEAR_COUNTS, 'monthly_challenge_q1', 'years'), // [review]
  badge('bihar', 'events', 'Bihar', 'Spring', YEAR_COUNTS, 'monthly_challenge_q2', 'years'), // [review]
  badge('havin', 'events', 'Havîn', 'Summer', YEAR_COUNTS, 'monthly_challenge_q3', 'years'), // [review]
  badge('payiz', 'events', 'Payîz', 'Autumn', YEAR_COUNTS, 'monthly_challenge_q4', 'years'), // [review]
  badge('mehane', 'events', 'Mehane', 'Monthly', [1, 3, 6, 12], 'monthly_challenges', 'months'), // [review]

  // G. Secret (diamond)
  badge('tire-rast', 'secret', 'Tîrê rast', 'Straight arrow', [1], 'battle_win_two_guesses', 'times', { secret: true }), // [review]
  badge('ji-nu-ve', 'secret', 'Ji nû ve', 'Anew', [1], 'group_comeback_win', 'times', { secret: true }), // [review]
  badge('kewe-ciye', 'secret', 'Kewê çiyê', 'Mountain partridge', [1], 'beat_two_tiers_higher', 'times', { secret: true }), // [review]
  badge('deste-zerin', 'secret', 'Destê zêrîn', 'Golden hand', [1], 'flawless_race', 'times', { secret: true }), // [review]
  badge('mevane-agir', 'secret', 'Mêvanê agir', 'Guest of the fire', [1], 'newroz_story_on_newroz', 'times', { secret: true }), // [review]
  badge('kaniya-zanine', 'secret', 'Kaniya zanînê', 'Spring of knowledge', [1], 'seven_review_days', 'times', { secret: true }), // [review]
];

const BY_KEY = new Map(BADGES.map((b) => [b.key, b]));

export function badgeDef(key: string): BadgeDef | undefined {
  return BY_KEY.get(key);
}

export function isBadgeKey(key: unknown): key is string {
  return typeof key === 'string' && BY_KEY.has(key);
}

/** How many badges may be shown on a profile. */
export const SHOWCASE_SIZE = 3;
/** Rarity is shown only once this many people are active: below it, a percentage is noise. */
export const RARITY_MIN_ACTIVE_USERS = 500;

/**
 * Where each achievement of the old system went (contract 4 §B1). A tier here is
 * a floor the badge never falls below (0: the badge's own count already holds
 * what the achievement stood for); `null` keeps the old row as a legacy award
 * with nothing to map to.
 *
 * - streak-30 → Agir tier 2 (30 days).
 * - first-perfect → Bêkêmasî progress: one perfect lesson counts, as it always would.
 * - first-game-win → Peyvzan / Helbestvan progress: wins are counted from the
 *   games themselves, so nothing is invented for a win nobody recorded.
 * - newroz-2026 → the Newroz badge, tier 1.
 * - words-1000 → Peyvên min tier 3 (1000).
 * - tournament-win → retired: owners keep it, shown as a legacy award.
 */
export const LEGACY_ACHIEVEMENTS: Readonly<Record<string, { badge: string; floorTier: number } | null>> = {
  'streak-30': { badge: 'agir', floorTier: 2 },
  'first-perfect': { badge: 'bekemasi', floorTier: 0 },
  'first-game-win': { badge: 'peyvzan', floorTier: 0 },
  'newroz-2026': { badge: 'newroz', floorTier: 1 },
  'words-1000': { badge: 'peyven-min', floorTier: 3 },
  'tournament-win': null,
};

// ---- progress, the same sums everywhere -----------------------------------------

/**
 * The thresholds as numbers. `'all'` becomes `allTarget` (the units in the
 * learner's course), and every numeric threshold above it is brought down to
 * it, so finishing a short course still finishes the badge rather than leaving
 * its middle tiers out of reach. Without an `allTarget` an `'all'` tier cannot
 * be reached.
 */
export function resolveThresholds(def: BadgeDef, allTarget?: number): number[] {
  const all = allTarget !== undefined && allTarget > 0 ? allTarget : Number.POSITIVE_INFINITY;
  return def.tiers.map((t) => (t === 'all' ? all : Math.min(t, all)));
}

/** The highest tier (0 = none yet) a progress number has reached, tiers taken in order. */
export function badgeTierFor(def: BadgeDef, progress: number, allTarget?: number): number {
  const thresholds = resolveThresholds(def, allTarget);
  let tier = 0;
  for (const t of thresholds) {
    if (progress >= t) tier += 1;
    else break;
  }
  return tier;
}

export interface BadgeProgress {
  tier: number;
  /** the threshold of the next tier, or null once the last is reached */
  next: number | null;
  /** 0 … 1 towards the next tier, from the last one reached (1 when complete) */
  fraction: number;
}

/** "7 / 30 days": how far a learner is towards the next tier. */
export function badgeProgress(def: BadgeDef, progress: number, allTarget?: number): BadgeProgress {
  const thresholds = resolveThresholds(def, allTarget);
  const tier = badgeTierFor(def, progress, allTarget);
  const next = tier < thresholds.length ? thresholds[tier]! : null;
  if (next === null) return { tier, next: null, fraction: 1 };
  // an 'all' tier whose size is not known yet cannot be measured towards
  if (!Number.isFinite(next)) return { tier, next: null, fraction: 0 };
  const from = tier === 0 ? 0 : thresholds[tier - 1]!;
  const span = next - from;
  return { tier, next, fraction: span > 0 ? Math.max(0, Math.min(1, (progress - from) / span)) : 0 };
}

/**
 * The tier colour a badge is drawn in. A badge with a single tier is drawn in
 * gold: it has no ladder to climb, and copper would read as "the first of four".
 */
export function badgeTierKey(def: BadgeDef, tier: number): BadgeTierKey | null {
  if (tier <= 0) return null;
  if (def.tiers.length === 1) return 'zer';
  return BADGE_TIERS[Math.min(tier, BADGE_TIERS.length) - 1]!;
}

// ---- the shapes the API sends ---------------------------------------------------

export interface BadgeView {
  key: string;
  family: BadgeFamily;
  /** 0 = not earned yet */
  tier: number;
  tierCount: number;
  tierKey: BadgeTierKey | null;
  progress: number;
  /** each tier's threshold, resolved ('all' is a number here; 0 while it is unknown) */
  thresholds: number[];
  next: number | null;
  unit: BadgeUnit;
  earnedAt: string | null;
  tierEarnedAt: string[];
  secret: boolean;
  /** a secret not yet found: no name, no progress, only "???" (and `hintKey` once any secret is found) */
  hidden: boolean;
  /** shown for a hidden secret once the learner has found one */
  hintKey: string | null;
  /** share of active learners holding each tier, 0–100; null while fewer than 500 are active */
  rarity: number[] | null;
}

/** `GET /me/badges`. */
export interface BadgesResponse {
  badges: BadgeView[];
  showcase: string[];
  secretsFound: number;
  secretsTotal: number;
  /** awards from the old achievements that no badge replaced (the tournament win) */
  legacy: Array<{ key: string; earnedAt: string }>;
  /** the monthly challenge in progress: learning days this month and the goal for it */
  monthlyChallenge: { month: string; days: number; goal: number };
}

/** One of the three badges on a profile. */
export interface ShowcaseBadge {
  key: string;
  family: BadgeFamily;
  tier: number;
  tierKey: BadgeTierKey | null;
}

/** The realtime event (`badge_unlocked`) that starts the celebration. */
export interface BadgeUnlockedEvent {
  type: 'badge_unlocked';
  key: string;
  family: BadgeFamily;
  tier: number;
  tierKey: BadgeTierKey | null;
  secret: boolean;
}

/** `GET /me/badges/unseen`: unlocks not yet celebrated, oldest first. */
export interface UnseenBadge {
  key: string;
  family: BadgeFamily;
  tier: number;
  tierKey: BadgeTierKey | null;
  secret: boolean;
  earnedAt: string;
}
