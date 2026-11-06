/**
 * The village's own level, and how the valley fills in as it rises: which
 * pieces of village life, and which villagers at their chores, appear round
 * the buildings at which level, and how many animals there are.
 *
 * The village's level is worked out purely from what the server already
 * sends (the `KingdomView`): its experience is every building's level in full
 * plus the share of the way each has come toward its next, so the first
 * lesson already moves the bar. Levels recorded on the server are never lost,
 * since a building's level in the view is never below its recorded one.
 * Nothing is sent from the client and nothing is stored but, on each device,
 * the last level the learner was shown, so a level-up is celebrated once.
 *
 * The levels climb a rising curve: the first come within the first day, and
 * each after asks a little more experience than the one before, while every
 * building's own levels ask for more learning as they rise. Each level brings
 * something into the valley a Kurdish mountain village would gain as it
 * grows, roughly in the order a village gains them — the first wheat and the
 * woman baking bread at the tenûr, hens, a sheepfold, children at play, the
 * mill on the stream, a boat, a rider on the donkey — until at the top it is a
 * thriving village dressed for a feast.
 */
import { KINGDOM_LEVEL_TOTAL, kingdomProgress, type KingdomBuildingView } from './view.js';
import { KINGDOM_MAX_LEVEL, type KingdomBuilding } from './buildings.js';

/** Everything the village gains round its buildings, in the order it is gained. */
export const VILLAGE_FEATURES = [
  'camp',
  'plots',
  'shepherd',
  'wheat',
  'baker',
  'hens',
  'sheepfold',
  'farmer',
  'laundry',
  'haystack',
  'chickpeas',
  'chicks',
  'children',
  'goatfold',
  'signs',
  'waterCarrier',
  'mill',
  'tomatoes',
  'benches',
  'dock',
  'cow',
  'boat',
  'elder',
  'lanterns',
  'hives',
  'onions',
  'threshing',
  'donkey',
  'rider',
  'orchardRows',
  'kilims',
  'jars',
  'flowers',
  'poplars',
  'bigFlock',
  'bridge',
  'dovecote',
  'loom',
  'weaver',
  'festival',
] as const;
export type VillageFeature = (typeof VILLAGE_FEATURES)[number];

/** The village's levels: the first, where every village starts, to the last. */
export const VILLAGE_MAX_LEVEL = 25;

/**
 * What each village level brings, from level 1 (what every village starts
 * with) to the last. Every level after the first brings something new to see.
 */
const UNLOCKS: readonly (readonly VillageFeature[])[] = [
  ['camp', 'plots', 'shepherd'],
  ['wheat', 'baker'],
  ['hens'],
  ['sheepfold', 'farmer'],
  ['laundry'],
  ['haystack', 'chickpeas'],
  ['chicks', 'children'],
  ['goatfold'],
  ['signs', 'waterCarrier'],
  ['mill'],
  ['tomatoes', 'benches'],
  ['dock'],
  ['cow'],
  ['boat', 'elder'],
  ['lanterns'],
  ['hives', 'onions'],
  ['threshing'],
  ['donkey', 'rider'],
  ['orchardRows'],
  ['kilims', 'jars'],
  ['flowers', 'poplars'],
  ['bigFlock'],
  ['bridge'],
  ['dovecote', 'loom', 'weaver'],
  ['festival'],
];

/**
 * The experience each level is reached at, rising: the second level is less
 * than one building level's worth (a first lesson's), and each step after
 * asks a little more than the last, up to every building finished.
 */
function thresholds(): number[] {
  const steps = VILLAGE_MAX_LEVEL - 1;
  const first = 0.8;
  // each step this much longer than the one before, so that the last level is every building finished
  const rise = (KINGDOM_LEVEL_TOTAL - first * steps) / ((steps * (steps - 1)) / 2);
  const out = [0];
  for (let i = 0; i < steps; i++) out.push(Math.round((out[i]! + first + rise * i) * 100) / 100);
  out[steps] = KINGDOM_LEVEL_TOTAL;
  return out;
}

/** One of the village's levels: the experience it is reached at and what it brings. */
export interface VillageLevel {
  level: number;
  xp: number;
  unlocks: readonly VillageFeature[];
}

export const VILLAGE_LEVELS: readonly VillageLevel[] = (() => {
  const xp = thresholds();
  return UNLOCKS.map((unlocks, i) => ({ level: i + 1, xp: xp[i]!, unlocks }));
})();

/** The village level each piece appears at. */
export const VILLAGE_GROWTH: Readonly<Record<VillageFeature, number>> = Object.fromEntries(VILLAGE_LEVELS.flatMap((l) => l.unlocks.map((f) => [f, l.level]))) as Record<VillageFeature, number>;

type Standing = Pick<KingdomBuildingView, 'id' | 'level' | 'count' | 'from' | 'next'>;

/**
 * The village's experience: each building's level in full and the share of
 * the way it has come to its next, from 0 to 30 (every building finished).
 * `shown` is the level an app is showing each building at, where it is still
 * one below its new level until that level has been celebrated: such a
 * building counts as all but at its next.
 */
export function villageXp(buildings: readonly Standing[], shown?: Readonly<Partial<Record<KingdomBuilding, number>>>): number {
  let xp = 0;
  for (const b of buildings) {
    const at = shown?.[b.id] ?? b.level;
    if (at < b.level) xp += at + 0.99;
    else xp += b.level + (b.level >= KINGDOM_MAX_LEVEL || b.next === null ? 0 : kingdomProgress(b));
  }
  return Math.max(0, Math.min(KINGDOM_LEVEL_TOTAL, xp));
}

/** The level a village with this much experience stands at (the levels of the buildings alone, with no progress, are experience too). */
export function villageLevelAt(xp: number): number {
  if (!Number.isFinite(xp)) return 1;
  let level = 1;
  for (const l of VILLAGE_LEVELS) if (xp >= l.xp - 1e-9) level = l.level;
  return level;
}

/** Where the village stands: its level, its experience, the share of the way to its next level, and what that level brings (null at the top). */
export interface VillageStanding {
  level: number;
  xp: number;
  share: number;
  next: VillageLevel | null;
}

export function villageStanding(buildings: readonly Standing[], shown?: Readonly<Partial<Record<KingdomBuilding, number>>>): VillageStanding {
  const xp = villageXp(buildings, shown);
  const level = villageLevelAt(xp);
  const next = VILLAGE_LEVELS[level] ?? null;
  const from = VILLAGE_LEVELS[level - 1]!.xp;
  return { level, xp, share: next ? Math.max(0, Math.min(1, (xp - from) / (next.xp - from))) : 1, next };
}

/** A level as the village reads it: a whole level from 1 to the last, whatever it is handed. */
function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.min(VILLAGE_MAX_LEVEL, Math.floor(level)));
}

/** Whether the village shows a piece at this village level. */
export function villageHas(level: number, feature: VillageFeature): boolean {
  return clampLevel(level) >= VILLAGE_GROWTH[feature];
}

/** Every piece the village shows at this level, in the order they were gained. */
export function villageGrowth(level: number): VillageFeature[] {
  return VILLAGE_FEATURES.filter((f) => villageHas(level, f));
}

/** How many of each animal the village keeps at a level: the flock grows as the village does. */
export interface VillageFlock {
  /** the shepherds' sheep by the camp, there from the start */
  campSheep: number;
  /** sheep in the fold */
  sheep: number;
  /** black goats in their fold (the wild ones on the crags are always there) */
  goats: number;
  hens: number;
  chicks: number;
  cows: number;
  donkeys: number;
}

export function villageFlock(level: number): VillageFlock {
  const l = clampLevel(level);
  const has = (f: VillageFeature): boolean => l >= VILLAGE_GROWTH[f];
  return {
    campSheep: 2,
    sheep: !has('sheepfold') ? 0 : has('bigFlock') ? 5 : l >= 15 ? 4 : l >= 9 ? 3 : 2,
    goats: !has('goatfold') ? 0 : l >= 18 ? 3 : 2,
    hens: !has('hens') ? 0 : l >= 10 ? 3 : 2,
    chicks: !has('chicks') ? 0 : l >= 20 ? 5 : 3,
    cows: has('cow') ? 1 : 0,
    donkeys: has('donkey') ? 1 : 0,
  };
}
