/**
 * The badge catalogue for the API, both apps and the admin. Seven families, each with its own medallion shape so a badge
 * is known without its colour, and up to four tiers: Sifir, Zîv, Zêr, Firûze (copper, silver, gold, turquoise). Progress
 * is always counted by the server from what happened, never reported by a client.
 *
 * The ladder assumes the default daily goal: a first badge in the first session, copper within about a week, silver
 * around two months (about as long as a daily habit takes to form), gold around half a year, turquoise after a year or
 * more. Thresholds are round numbers, streaks stop at a year, and an earned tier is never taken back when a ladder
 * changes. Nothing rewards staying up late, spending or inviting people, and a badge reports what you did rather than
 * paying for it. Where something cannot be measured, a measurable stand-in is used and said at the badge.
 *
 * Kurdish names marked [review] await a native speaker's check.
 */

export const BADGE_FAMILIES = ['learning', 'habit', 'games', 'ranked', 'friends', 'events', 'secret'] as const;
export type BadgeFamily = (typeof BADGE_FAMILIES)[number];

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
  | 'times'
  | 'answers'
  | 'letters';

/** A tier's threshold: a number, or `'all'` for every unit of the course, a number only the server knows (`resolveThresholds`). */
export type BadgeThreshold = number | 'all';

export interface BadgeDef {
  key: string;
  family: BadgeFamily;
  /** what each tier needs, low to high; one entry for a badge with a single tier */
  tiers: readonly BadgeThreshold[];
  /** hidden until earned ("???"), with a hint once the learner has found any secret */
  secret: boolean;
  /** No longer awarded (game ranks and rated play ended): shown only to those who earned it, at the tier they reached. */
  retired: boolean;
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
  opts: { secret?: boolean; retired?: boolean } = {},
): BadgeDef {
  const secret = opts.secret ?? false;
  return {
    key,
    family,
    tiers,
    secret,
    retired: opts.retired ?? false,
    nameKu,
    meaningEn,
    ...keys(key),
    ...(secret ? { hintKey: `badges.${key}.hint` } : {}),
    measure,
    unit,
  };
}

/** Ranked emblems counted seasons in which a tier was reached, in any game; there were four seasons a year. */
const SEASON_COUNTS = [1, 3, 5, 8] as const;
const RETIRED = { retired: true } as const;
/** Dated event badges: the distinct years taken part. */
const YEAR_COUNTS = [1, 2, 3, 5] as const;

export const BADGES: readonly BadgeDef[] = [
  // A. Learning (circle).
  badge('ders', 'learning', 'Wane', 'Lessons', [10, 75, 250, 750], 'lessons_completed', 'lessons'), // [review]
  // An item in the review deck, a word or a lesson phrase, remembered at least twice days apart (SM-2's second interval).
  badge('peyven-min', 'learning', 'Peyvên min', 'My words', [50, 400, 1000, 4000], 'review_items_remembered', 'words'), // [review]
  badge('bekemasi', 'learning', 'Bêkêmasî', 'Flawless', [1, 40, 150, 400], 'perfect_lessons', 'lessons'), // [review]
  badge('dubare', 'learning', 'Dubare', 'Review', [50, 400, 2000, 6000], 'review_answers', 'reviews'), // [review]
  badge('cirokbej', 'learning', 'Çîrokbêj', 'Storyteller', [3, 15, 50, 150], 'stories_finished', 'stories'), // [review]
  badge('rewi', 'learning', 'Rêwî', 'Traveller', [1, 5, 15, 'all'], 'units_completed', 'units'), // [review]
  // Stands in for "alphabet mastered", which nothing records.
  badge('ferheng', 'learning', 'Ferheng', 'Dictionary', [10, 75, 250, 750], 'dictionary_words_reviewed', 'words'), // [review]
  // Answers in listening and speaking exercises.
  badge('zengil', 'learning', 'Zengil', 'Bell', [25, 200, 750, 2500], 'listening_speaking_answers', 'answers'), // [review]
  // Answers written out in full rather than picked: translating and writing exercises.
  badge('penus', 'learning', 'Pênûs', 'Pen', [25, 200, 750, 2500], 'typed_answers', 'answers'), // [review]
  // Review items known so well they come back only after a month or more.
  badge('belur', 'learning', 'Belûr', 'Crystal', [10, 75, 250, 750], 'review_items_month', 'words'), // [review]
  // Words saved from the dictionary to the learner's own list.
  badge('gencine', 'learning', 'Gencîne', 'Treasure', [10, 50, 200, 500], 'saved_words', 'words'), // [review]

  // B. Habit (rounded square).
  badge('agir', 'habit', 'Agir', 'Fire', [7, 30, 100, 365], 'longest_streak', 'days'), // [review]
  badge('hefte', 'habit', 'Hefte', 'Week', [4, 13, 40, 100], 'weekly_goals_met', 'weeks'), // [review]
  badge('roj', 'habit', 'Roj', 'Days', [30, 120, 365, 730], 'learning_days', 'days'), // [review]
  // A return after 14 or more days away: a welcome back, never a reproach.
  badge('vegera', 'habit', 'Vegera', 'Return', [1], 'comebacks', 'times'), // [review]
  // The Okyanûs trophy: a top-three week in an Okyanûs group with the goal met.
  badge('pela', 'habit', 'Pêla', 'Wave', [1, 3, 10, 25], 'okyanus_top_three_weeks', 'weeks'), // [review]
  // A daily goal met; at most one a day.
  badge('cay', 'habit', 'Çay', 'Tea', [7, 50, 150, 500], 'daily_goals_met', 'days'), // [review]
  // A calendar week (Monday to Sunday, UTC) with learning on all seven days.
  badge('gula-hefte', 'habit', 'Gula heftê', 'Flower of the week', [1, 6, 20, 52], 'full_weeks', 'weeks'), // [review]
  // A calendar month (UTC) with learning on every one of its days.
  badge('heyva-cardehe', 'habit', 'Heyva çardehê', 'Full moon', [1, 3, 6, 12], 'full_months', 'months'), // [review]

  // C. Games (hexagon).
  badge('peyvzan', 'games', 'Peyvzan', 'Word-knower', [5, 40, 150, 500], 'wordle_battle_wins', 'wins'), // [review]
  badge('helbestvan', 'games', 'Helbestvan', 'Poet', [5, 40, 150, 500], 'rhyme_match_wins', 'wins'), // [review]
  badge('bilez', 'games', 'Bilez', 'Fast', [20, 35, 55, 75], 'race_best_wpm', 'wpm'), // [review]
  // The route through typing that is not about speed: accuracy at any speed.
  badge('rastnivis', 'games', 'Rastnivîs', 'Accurate writer', [10, 75, 250, 750], 'races_98_percent', 'races'), // [review]
  badge('guhdar', 'games', 'Guhdar', 'Listener', [3, 20, 75, 200], 'story_quiz_perfect', 'games'), // [review]
  // Peyvok, Rhyme, the Typing Race and Stories, each played at least once.
  badge('hemereng', 'games', 'Hemereng', 'All colours', [4], 'games_tried', 'games'), // [review]
  badge('dilpak', 'games', 'Dilpak', 'Pure-hearted', [50, 150, 400, 1000], 'fair_rated_games', 'games', RETIRED), // [review]
  // The day's Peyvok solved, one a day at most, so it counts days.
  badge('mamik', 'games', 'Mamik', 'Riddle', [5, 50, 150, 500], 'daily_peyvok_solved', 'days'), // [review]
  // Rhymes found alone in Rhyme training.
  badge('bilbil', 'games', 'Bilbil', 'Nightingale', [50, 500, 2000, 6000], 'training_rhymes', 'words'), // [review]
  // A Peyvok, the day's or a practice one, won in three guesses or fewer.
  badge('elmas', 'games', 'Elmas', 'Diamond', [5, 40, 150, 400], 'peyvok_three_guesses', 'wins'), // [review]

  // D. Ranked (shield): retired with game ranks, kept by those who earned them.
  badge('rank-dest', 'ranked', 'Deşt', 'Plain', SEASON_COUNTS, 'seasons_reached_dest', 'seasons', RETIRED), // [review]
  badge('rank-gir', 'ranked', 'Gir', 'Hill', SEASON_COUNTS, 'seasons_reached_gir', 'seasons', RETIRED), // [review]
  badge('rank-zozan', 'ranked', 'Zozan', 'High pasture', SEASON_COUNTS, 'seasons_reached_zozan', 'seasons', RETIRED), // [review]
  badge('rank-ciya', 'ranked', 'Çiya', 'Mountain', SEASON_COUNTS, 'seasons_reached_ciya', 'seasons', RETIRED), // [review]
  badge('rank-lutke', 'ranked', 'Lûtke', 'Summit', SEASON_COUNTS, 'seasons_reached_lutke', 'seasons', RETIRED), // [review]
  badge('rank-sterk', 'ranked', 'Stêrk', 'Star', SEASON_COUNTS, 'seasons_reached_sterk', 'seasons', RETIRED), // [review]
  badge('hilkiser', 'ranked', 'Hilkişer', 'Climber', SEASON_COUNTS, 'seasons_with_ten_rated_games', 'seasons', RETIRED), // [review]
  badge('cihgirti', 'ranked', 'Cihgirtî', 'Placed', [1], 'placements_finished', 'games', RETIRED), // [review]

  // E. Friends (leaf).
  // Stands in for friend quests: a finished game with a friend in it.
  badge('heval', 'friends', 'Heval', 'Friend', [1, 10, 40, 100], 'games_with_friends', 'games'), // [review]
  // A gift to one friend on one day counts once, however many are sent: it rewards giving, not spending.
  badge('diyari', 'friends', 'Diyarî', 'Gift', [1, 10, 50, 150], 'gift_days', 'gifts'), // [review]
  // Stands in for "helpful answers", which nothing marks: a game you hosted that others joined and finished.
  badge('mevandar', 'friends', 'Mêvandar', 'Host', [1, 15, 60, 200], 'games_hosted', 'games'), // [review]
  // A message to a friend counts once a day per friend: it rewards writing to people, not message counts.
  badge('name', 'friends', 'Name', 'Letter', [1, 15, 60, 200], 'friend_letter_days', 'letters'), // [review]
  // A rematch with a friend in it, played to the end.
  badge('dilgerm', 'friends', 'Dilgerm', 'Warm-hearted', [1, 15, 60, 200], 'friend_rematches', 'games'), // [review]

  // F. Events (eight-point star): dated, open at least seven days, never sold.
  badge('newroz', 'events', 'Agirê Newrozê', 'Newroz fire', YEAR_COUNTS, 'learned_newroz_week', 'years'), // [review]
  badge('roja-ziman', 'events', 'Roja Zimanê Kurdî', 'Kurdish Language Day', YEAR_COUNTS, 'learned_language_day_week', 'years'), // [review]
  badge('zimane-dayike', 'events', 'Zimanê Dayikê', 'Mother Language', YEAR_COUNTS, 'learned_mother_language_week', 'years'), // [review]
  badge('sersal', 'events', 'Sersal', 'New Year', YEAR_COUNTS, 'learned_new_year_week', 'years'), // [review]
  // The longest night, in the week of the winter solstice.
  badge('yelda', 'events', 'Şeva Yeldayê', 'Yalda Night', YEAR_COUNTS, 'learned_yalda_week', 'years'), // [review]
  badge('zivistan', 'events', 'Zivistan', 'Winter', YEAR_COUNTS, 'monthly_challenge_q1', 'years'), // [review]
  badge('bihar', 'events', 'Bihar', 'Spring', YEAR_COUNTS, 'monthly_challenge_q2', 'years'), // [review]
  badge('havin', 'events', 'Havîn', 'Summer', YEAR_COUNTS, 'monthly_challenge_q3', 'years'), // [review]
  badge('payiz', 'events', 'Payîz', 'Autumn', YEAR_COUNTS, 'monthly_challenge_q4', 'years'), // [review]
  badge('mehane', 'events', 'Mehane', 'Monthly', [1, 3, 6, 12], 'monthly_challenges', 'months'), // [review]

  // G. Secret (diamond).
  badge('tire-rast', 'secret', 'Tîrê rast', 'Straight arrow', [1], 'battle_win_two_guesses', 'times', { secret: true }), // [review]
  badge('ji-nu-ve', 'secret', 'Ji nû ve', 'Anew', [1], 'group_comeback_win', 'times', { secret: true }), // [review]
  badge('kewe-ciye', 'secret', 'Kewê çiyê', 'Mountain partridge', [1], 'beat_two_tiers_higher', 'times', { secret: true, retired: true }), // [review]
  badge('deste-zerin', 'secret', 'Destê zêrîn', 'Golden hand', [1], 'flawless_race', 'times', { secret: true }), // [review]
  badge('mevane-agir', 'secret', 'Mêvanê agir', 'Guest of the fire', [1], 'newroz_story_on_newroz', 'times', { secret: true }), // [review]
  badge('kaniya-zanine', 'secret', 'Kaniya zanînê', 'Spring of knowledge', [1], 'seven_review_days', 'times', { secret: true }), // [review]
  // A Peyvok won on the sixth and last guess.
  badge('pisika-wane', 'secret', 'Pisîka Wanê', 'Van cat', [1], 'peyvok_last_guess', 'times', { secret: true }), // [review]
  // Back after two weeks or more away, then seven days in a row from the return.
  badge('perperok', 'secret', 'Perperok', 'Butterfly', [1], 'comeback_week', 'times', { secret: true }), // [review]
  // A Peyvok won on the first guess.
  badge('sterka-siqiti', 'secret', 'Stêrka şiqitî', 'Shooting star', [1], 'peyvok_first_guess', 'times', { secret: true }), // [review]
  // A counted full review with every answer right first time and every letter in place.
  badge('mirari', 'secret', 'Mirarî', 'Pearl', [1], 'perfect_full_review', 'times', { secret: true }), // [review]
];

const BY_KEY = new Map(BADGES.map((b) => [b.key, b]));

export function badgeDef(key: string): BadgeDef | undefined {
  return BY_KEY.get(key);
}

/** How many badges may be shown on a profile. */
export const SHOWCASE_SIZE = 3;
/** Rarity is shown only once this many people are active; below that a percentage is noise. */
export const RARITY_MIN_ACTIVE_USERS = 500;

// ---- progress, the same sums everywhere -----------------------------------------

/**
 * The thresholds as numbers. `'all'` becomes `allTarget` (the units in the learner's course) and higher thresholds are
 * capped to it, so finishing a short course still finishes the badge. Without `allTarget` an `'all'` tier is unreachable.
 */
export function resolveThresholds(def: BadgeDef, allTarget?: number): number[] {
  const all = allTarget !== undefined && allTarget > 0 ? allTarget : Number.POSITIVE_INFINITY;
  return def.tiers.map((t) => (t === 'all' ? all : Math.min(t, all)));
}

/** The highest tier reached (0: none yet), tiers taken in order. */
export function badgeTierFor(def: BadgeDef, progress: number, allTarget?: number): number {
  const thresholds = resolveThresholds(def, allTarget);
  let tier = 0;
  for (const t of thresholds) {
    if (progress >= t) tier += 1;
    else break;
  }
  return tier;
}

/** 0 … 1 from a view's last tier to its next; 1 once complete. */
export function badgeViewFraction(view: Pick<BadgeView, 'tier' | 'thresholds' | 'next' | 'progress'>): number {
  if (view.next === null) return 1;
  const from = view.tier > 0 ? (view.thresholds[view.tier - 1] ?? 0) : 0;
  const span = view.next - from;
  return span > 0 ? Math.max(0, Math.min(1, (view.progress - from) / span)) : 0;
}

/**
 * How much is left to the next tier once past halfway, else null: progress is followed best as the smaller part, done
 * while it is little and left once that is, which also carries people through the middle.
 */
export function badgeLeft(view: Pick<BadgeView, 'tier' | 'thresholds' | 'next' | 'progress' | 'hidden'>): number | null {
  if (view.hidden || view.next === null) return null;
  return badgeViewFraction(view) >= 0.5 ? Math.max(0, view.next - view.progress) : null;
}

/**
 * The badges nearest their next tier, nearest first, since people try harder the closer a goal is. Only begun badges
 * count, never a hidden secret or a finished one; ties go to the one with less left.
 */
export function nearestBadges(views: readonly BadgeView[], count = 3): BadgeView[] {
  return views
    .filter((v) => !v.hidden && v.next !== null && v.progress > 0 && badgeViewFraction(v) > 0)
    .map((v) => ({ v, f: badgeViewFraction(v), left: v.next! - v.progress }))
    .sort((a, b) => b.f - a.f || a.left - b.left || a.v.key.localeCompare(b.v.key))
    .slice(0, count)
    .map((x) => x.v);
}

/** The tier colour a badge is drawn in. A single-tier badge is gold, since copper would read as "the first of four". */
export function badgeTierKey(def: BadgeDef, tier: number): BadgeTierKey | null {
  if (tier <= 0) return null;
  if (def.tiers.length === 1) return 'zer';
  return BADGE_TIERS[Math.min(tier, BADGE_TIERS.length) - 1]!;
}

// ---- the shapes the API sends ---------------------------------------------------

export interface BadgeView {
  key: string;
  family: BadgeFamily;
  /** 0: not earned yet */
  tier: number;
  tierCount: number;
  tierKey: BadgeTierKey | null;
  progress: number;
  /** each tier's threshold, resolved ('all' as a number here; 0 while unknown) */
  thresholds: number[];
  next: number | null;
  unit: BadgeUnit;
  earnedAt: string | null;
  tierEarnedAt: string[];
  secret: boolean;
  /** a secret not yet found: no name and no progress, only "???" (and `hintKey` once any secret is found) */
  hidden: boolean;
  /** shown for a hidden secret once the learner has found one */
  hintKey: string | null;
  /** the share of active learners holding each tier, 0–100; null while fewer than 500 are active */
  rarity: number[] | null;
}

/** `GET /me/badges`. */
export interface BadgesResponse {
  badges: BadgeView[];
  showcase: string[];
  secretsFound: number;
  secretsTotal: number;
  /** awards from the old achievements that no badge replaced */
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
