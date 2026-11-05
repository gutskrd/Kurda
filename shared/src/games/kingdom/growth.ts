/**
 * How The Village fills in as the learner's total level rises, from 0 (no
 * building begun) to 30 (all six finished): which pieces of village life
 * appear round the buildings at which total, and how many animals there are.
 *
 * This is a picture only. It is worked out from the levels the server already
 * sends (`kingdomLevelCount` of the view), adds nothing to the economy, sends
 * nothing from the client and stores nothing: the same levels always draw the
 * same village, on every device.
 *
 * At 0 the valley holds the shepherds' black tent, their few sheep and two
 * plots dug for sowing. Every level adds something a Kurdish mountain village
 * would gain as it grows, roughly in the order a village gains them — the
 * first wheat, hens, a sheepfold, a haystack, the mill on the stream, the
 * dock, the boat, a dovecote, a kilim loom set up outdoors — until at 30
 * it is a thriving village dressed for a feast, lanterns lit, kilims out to
 * air and flowers everywhere.
 */
import { KINGDOM_LEVEL_TOTAL, kingdomProgress, type KingdomBuildingView } from './view.js';
import { KINGDOM_MAX_LEVEL } from './buildings.js';

/** Everything the village gains round its buildings, in the order it is gained. */
export const VILLAGE_FEATURES = [
  'camp',
  'plots',
  'wheat',
  'hens',
  'sheepfold',
  'laundry',
  'haystack',
  'chickpeas',
  'chicks',
  'goatfold',
  'signs',
  'mill',
  'tomatoes',
  'benches',
  'dock',
  'cow',
  'boat',
  'lanterns',
  'hives',
  'onions',
  'threshing',
  'donkey',
  'orchardRows',
  'kilims',
  'jars',
  'flowers',
  'poplars',
  'bigFlock',
  'bridge',
  'dovecote',
  'loom',
  'festival',
] as const;
export type VillageFeature = (typeof VILLAGE_FEATURES)[number];

/**
 * The total level each piece appears at. Two are there from the start (the
 * camp and the dug plots); after that one new piece arrives with every level,
 * so each level a learner earns shows somewhere in the valley as well as on
 * its own building.
 */
export const VILLAGE_GROWTH: Readonly<Record<VillageFeature, number>> = {
  camp: 0,
  plots: 0,
  wheat: 1,
  hens: 2,
  sheepfold: 3,
  laundry: 4,
  haystack: 5,
  chickpeas: 6,
  chicks: 7,
  goatfold: 8,
  signs: 9,
  mill: 10,
  tomatoes: 11,
  benches: 12,
  dock: 13,
  cow: 14,
  boat: 15,
  lanterns: 16,
  hives: 17,
  onions: 18,
  threshing: 19,
  donkey: 20,
  orchardRows: 21,
  kilims: 22,
  jars: 23,
  flowers: 24,
  poplars: 25,
  bigFlock: 26,
  bridge: 27,
  dovecote: 28,
  loom: 29,
  festival: 30,
};

/** A total as the village reads it: a whole number from 0 to 30, whatever it is handed. */
function clampTotal(total: number): number {
  if (!Number.isFinite(total)) return 0;
  return Math.max(0, Math.min(KINGDOM_LEVEL_TOTAL, Math.floor(total)));
}

/** Whether the village shows a piece at this total level. */
export function villageHas(total: number, feature: VillageFeature): boolean {
  return clampTotal(total) >= VILLAGE_GROWTH[feature];
}

/** Every piece the village shows at this total level, in the order they were gained. */
export function villageGrowth(total: number): VillageFeature[] {
  return VILLAGE_FEATURES.filter((f) => villageHas(total, f));
}

/** The next piece the village will gain, and the total it comes at; null once everything stands. */
export function villageNext(total: number): { feature: VillageFeature; at: number } | null {
  const t = clampTotal(total);
  const next = VILLAGE_FEATURES.find((f) => VILLAGE_GROWTH[f] > t);
  return next ? { feature: next, at: VILLAGE_GROWTH[next] } : null;
}

/** How many of each animal the village keeps at a total level: the flock grows as the village does. */
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

export function villageFlock(total: number): VillageFlock {
  const t = clampTotal(total);
  const has = (f: VillageFeature): boolean => t >= VILLAGE_GROWTH[f];
  return {
    campSheep: 2,
    sheep: !has('sheepfold') ? 0 : has('bigFlock') ? 5 : t >= 18 ? 4 : t >= 11 ? 3 : 2,
    goats: !has('goatfold') ? 0 : t >= 21 ? 3 : 2,
    hens: !has('hens') ? 0 : t >= 12 ? 3 : 2,
    chicks: !has('chicks') ? 0 : t >= 24 ? 5 : 3,
    cows: has('cow') ? 1 : 0,
    donkeys: has('donkey') ? 1 : 0,
  };
}

/**
 * How far the village is on its way to its next level, 0–1, for the bar
 * beside its level badge: the village gains its next level when any building
 * does, so this is the share the building nearest its next level has come.
 * 1 once every building is finished.
 */
export function villageProgress(buildings: readonly Pick<KingdomBuildingView, 'level' | 'count' | 'from' | 'next'>[]): number {
  const open = buildings.filter((b) => b.level < KINGDOM_MAX_LEVEL && b.next !== null);
  if (open.length === 0) return 1;
  return Math.max(...open.map((b) => kingdomProgress(b)));
}
