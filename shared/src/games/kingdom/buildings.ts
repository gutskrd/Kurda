/**
 * The Village ("kingdom" in code): a mountain village that grows only from what the learner
 * has really learned. This module is its rulebook — the six buildings, what
 * kind of learning each one counts, and the five thresholds each one climbs.
 *
 * Each building counts one kind of learning, read on the server from the
 * learner's own records, never from anything a client sends and never from
 * time spent in the village, game XP or anything that grows by doing the same
 * thing again:
 *
 * - houses: words remembered in review — review items the spaced scheduler
 *   now brings back after six days or more (a same-day replay never moves the
 *   schedule, so they cannot be piled up in an afternoon);
 * - school: lessons passed — distinct lesson places finished with at least 80%
 *   right, however many times a lesson is repeated;
 * - tea house: stories passed — distinct stories whose questions were answered
 *   with at least 60% right, in a game that counted as learning;
 * - spring: listening — distinct listening exercises answered right;
 * - market: conversation — distinct conversation exercises answered right;
 * - orchard: consistency — days on which the learner learned.
 *
 * The thresholds come from the content there is. The Kurmanji Road has 12
 * units of 4 skills of 4 lessons: a skill is 4 lessons, a unit 16, its A1
 * units (1–4) 64, its A2 units (5–9) 144 and the whole Road 192. Per unit it
 * has about 30 listening exercises (31 in unit 1, 129 through A1, 260 through
 * A2, 356 in all), about 8 conversations (7, 31, 70, 100) and about 220
 * exercises that feed review (219, 881, 1,953, 2,633). So each building's
 * levels land as the learner finishes a skill, a unit, the A1 units, the A2
 * units and the Road, with a little slack in the item counts for the odd item
 * that keeps slipping. There are 9 Kurmanji and 8 Soranî starter stories, so
 * the tea house tops out at 8, which either dialect alone can reach. The
 * orchard counts days in round steps a learner can feel: half a week, ten
 * days, a month, a season and half a year.
 *
 * One village per learner, not per dialect: the records it reads are kept per
 * learner (days learned and review items carry no dialect), the server does
 * not know which dialect a learner is on (each device remembers its course),
 * and Soranî has no lessons yet, so a Soranî village would hold a school and a
 * market that could never be built. A learner who reads in both dialects
 * builds one village with both.
 */

export const KINGDOM_BUILDINGS = ['houses', 'school', 'teahouse', 'spring', 'market', 'orchard'] as const;
export type KingdomBuilding = (typeof KINGDOM_BUILDINGS)[number];

export function isKingdomBuilding(value: unknown): value is KingdomBuilding {
  return typeof value === 'string' && (KINGDOM_BUILDINGS as readonly string[]).includes(value);
}

/** A building's level: 0 is the empty plot, 5 the building finished. */
export type KingdomLevel = 0 | 1 | 2 | 3 | 4 | 5;
export const KINGDOM_MAX_LEVEL = 5;

/** What a building counts, as the server measures it. */
export type KingdomMeasure = 'words_remembered' | 'lessons_passed' | 'stories_passed' | 'listening_right' | 'conversations_right' | 'learning_days';

/**
 * The part of Learn that grows a building, which each app turns into its own
 * route: Practice's review, the lesson path, or the Stories library. The
 * spring and the market go to the lessons, not to a practice session: an
 * exercise counts once, so only a lesson not yet done brings new ones.
 */
export type KingdomPlace = 'review' | 'lessons' | 'stories';

export interface KingdomBuildingDef {
  id: KingdomBuilding;
  measure: KingdomMeasure;
  /** the count at which each of levels 1–5 is reached, rising */
  thresholds: readonly [number, number, number, number, number];
  place: KingdomPlace;
}

/** A lesson counts for the school when at least this share of it was right. */
export const KINGDOM_LESSON_PASS = 0.8;
/** A story counts for the tea house when at least this share of its questions was right. */
export const KINGDOM_STORY_PASS = 0.6;

export const KINGDOM: Readonly<Record<KingdomBuilding, KingdomBuildingDef>> = {
  // about one lesson's review items, a skill's, unit 1's, the A1 units' and the A2 units'
  houses: { id: 'houses', measure: 'words_remembered', thresholds: [12, 50, 200, 800, 1800], place: 'review' },
  // a skill, a unit, the A1 units, the A2 units, the whole Road
  school: { id: 'school', measure: 'lessons_passed', thresholds: [4, 16, 64, 144, 192], place: 'lessons' },
  // the first story, then two, four, six and eight
  teahouse: { id: 'teahouse', measure: 'stories_passed', thresholds: [1, 2, 4, 6, 8], place: 'stories' },
  // a skill's listening, unit 1's, the A1 units', the A2 units', nearly all of the Road's
  spring: { id: 'spring', measure: 'listening_right', thresholds: [8, 30, 125, 250, 340], place: 'lessons' },
  // the first conversations, unit 1's, the A1 units', the A2 units', nearly all of the Road's
  market: { id: 'market', measure: 'conversations_right', thresholds: [2, 7, 30, 68, 96], place: 'lessons' },
  // half a week, ten days, a month, a season, half a year
  orchard: { id: 'orchard', measure: 'learning_days', thresholds: [3, 10, 30, 90, 180], place: 'lessons' },
};

/** The level a count reaches. */
export function levelFor(building: KingdomBuilding, count: number): KingdomLevel {
  const { thresholds } = KINGDOM[building];
  let level = 0;
  for (const t of thresholds) if (count >= t) level += 1;
  return level as KingdomLevel;
}

/** The count a level is reached at (0 for the empty plot). */
export function thresholdOf(building: KingdomBuilding, level: KingdomLevel): number {
  return level === 0 ? 0 : KINGDOM[building].thresholds[level - 1]!;
}
