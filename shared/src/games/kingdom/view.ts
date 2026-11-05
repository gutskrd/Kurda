/**
 * What GET /kingdom answers and both apps draw from, and the pure steps that
 * turn the learner's counts and the levels already recorded into it: which
 * level each building stands at, how far it is to the next, and which levels
 * are new and must be recorded (once) before they are shown.
 *
 * A level, once recorded, is never taken back. The counts are worked out again
 * on every read, and some of what they count can shrink — a story game is
 * deleted after 400 days, a lesson can gain a newly published exercise — but
 * a building does not fall down because of it: it stands at the higher of its
 * recorded level and the level its count reaches now.
 */
import { KINGDOM, KINGDOM_BUILDINGS, KINGDOM_MAX_LEVEL, levelFor, thresholdOf, type KingdomBuilding, type KingdomLevel, type KingdomPlace } from './buildings.js';

/** The learner's count for each building's kind of learning. */
export type KingdomCounts = Readonly<Record<KingdomBuilding, number>>;

/** One building as the village shows it. */
export interface KingdomBuildingView {
  id: KingdomBuilding;
  level: KingdomLevel;
  /** the learner's count of this building's kind of learning, now */
  count: number;
  /** the count this level was reached at (0 for the empty plot), where the bar to the next one starts */
  from: number;
  /** the count the next level is reached at; null once the building is finished */
  next: number | null;
  /** how many more until the next level (0 once finished) */
  remaining: number;
  /** where in Learn this building grows */
  place: KingdomPlace;
}

/** A level reached and recorded, to celebrate once. */
export interface KingdomUpgrade {
  building: KingdomBuilding;
  level: Exclude<KingdomLevel, 0>;
  /** Zêr paid for it, decided by the server; 0 when none was (a guest, or an account the economy does not pay) */
  zer: number;
  reachedAt: string;
}

export interface KingdomView {
  buildings: KingdomBuildingView[];
  /** levels reached since the learner last looked, oldest first; each is shown once, then marked seen */
  celebrate: KingdomUpgrade[];
  /**
   * The first visit: the one sentence on how the village grows, and what the
   * learning done before the village existed had already built (levels
   * recorded when it was founded are not celebrated one by one). Null after
   * the first visit was seen.
   */
  intro: { levels: number; zer: number } | null;
}

/** POST /kingdom/seen: the upgrades the learner was shown, and whether the first visit's sentence was. */
export interface KingdomSeenBody {
  levels?: { building: KingdomBuilding; level: number }[];
  intro?: boolean;
}

/** The level each building has recorded (0 when none). */
export type KingdomRecorded = Readonly<Record<KingdomBuilding, KingdomLevel>>;

export const NO_KINGDOM_LEVELS: KingdomRecorded = Object.freeze(
  Object.fromEntries(KINGDOM_BUILDINGS.map((b) => [b, 0])) as Record<KingdomBuilding, KingdomLevel>,
);

/** The level a building stands at: its recorded level or the one its count reaches, whichever is higher. */
export function standingLevel(building: KingdomBuilding, count: number, recorded: KingdomLevel): KingdomLevel {
  return Math.max(recorded, levelFor(building, count)) as KingdomLevel;
}

/** One building's view from its count and its recorded level. */
export function buildingView(building: KingdomBuilding, count: number, recorded: KingdomLevel): KingdomBuildingView {
  const level = standingLevel(building, count, recorded);
  const next = level >= KINGDOM_MAX_LEVEL ? null : thresholdOf(building, (level + 1) as KingdomLevel);
  return {
    id: building,
    level,
    count,
    from: thresholdOf(building, level),
    next,
    remaining: next === null ? 0 : Math.max(0, next - count),
    place: KINGDOM[building].place,
  };
}

/**
 * The levels the counts reach that are not recorded yet, in the order they
 * are recorded: building by building in the village's order, each from its
 * lowest new level up. A fixed order matters to the server: two reads that
 * record the same levels at once take their rows' locks in the same order.
 */
export function newLevels(counts: KingdomCounts, recorded: KingdomRecorded): { building: KingdomBuilding; level: Exclude<KingdomLevel, 0> }[] {
  const out: { building: KingdomBuilding; level: Exclude<KingdomLevel, 0> }[] = [];
  for (const building of KINGDOM_BUILDINGS) {
    const reached = levelFor(building, counts[building] ?? 0);
    for (let level = recorded[building] + 1; level <= reached; level++) out.push({ building, level: level as Exclude<KingdomLevel, 0> });
  }
  return out;
}

/** Every building's view, in the village's order. */
export function kingdomBuildings(counts: KingdomCounts, recorded: KingdomRecorded): KingdomBuildingView[] {
  return KINGDOM_BUILDINGS.map((b) => buildingView(b, counts[b] ?? 0, recorded[b]));
}

/** The level each building stands at in a view, for drawing the village. */
export function kingdomLevels(buildings: readonly Pick<KingdomBuildingView, 'id' | 'level'>[]): Record<KingdomBuilding, KingdomLevel> {
  const levels = { ...NO_KINGDOM_LEVELS } as Record<KingdomBuilding, KingdomLevel>;
  for (const b of buildings) levels[b.id] = b.level;
  return levels;
}

/** Share of the way from this level to the next, 0–1 (1 once finished), for a progress bar. */
export function kingdomProgress(b: Pick<KingdomBuildingView, 'count' | 'from' | 'next'>): number {
  if (b.next === null) return 1;
  const span = b.next - b.from;
  return span <= 0 ? 1 : Math.max(0, Math.min(1, (b.count - b.from) / span));
}
