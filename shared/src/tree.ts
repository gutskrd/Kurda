/**
 * The learner's tree: what kinds there are, how one grows, and how it fares
 * when it is not watered. The same rules on the server, the website and the
 * phone, so a tree is the same tree wherever it is looked at.
 *
 * Everybody plants one tree. A lesson worked through earns water; water
 * poured on the tree grows it, from a seed under the ground to a great tree
 * in fruit or flower, in seven stages. A tree that goes without water for
 * days grows thirsty, then wilts, then withers — but it is never lost: what
 * it has grown stays, and the next water brings it back to leaf. A learner
 * who comes back after a break is met by a tree to revive, not an empty plot.
 *
 * Planting another kind replaces the tree that stands: the new one starts
 * from its seed. A few kinds are free to plant; the others are bought once
 * and can be planted again whenever wanted.
 */

/** The kinds of tree, the ones free to plant first. */
export const TREE_SPECIES = ['beru', 'hinar', 'behiv', 'bi', 'tu', 'spindar', 'kaj', 'payiz', 'miraz', 'sev'] as const;
export type TreeSpecies = (typeof TREE_SPECIES)[number];

export function isTreeSpecies(key: string): key is TreeSpecies {
  return (TREE_SPECIES as readonly string[]).includes(key);
}

/** How far a tree has grown: 0 is the seed under the ground, 6 the great tree. */
export const TREE_STAGES = 7;
export type TreeStage = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const TREE_FULL: TreeStage = 6;

/** How a tree is faring, by how long it has gone without water. */
export const TREE_HEALTHS = ['fresh', 'thirsty', 'wilting', 'withered'] as const;
export type TreeHealth = (typeof TREE_HEALTHS)[number];

/** What planting a kind costs: nothing for the ones everybody starts from, a price in Zêr, paid once, for the others. */
export interface TreeKind {
  species: TreeSpecies;
  starter: boolean;
  /** in Zêr; 0 for a starter */
  price: number;
}

export const TREE_KINDS: Readonly<Record<TreeSpecies, TreeKind>> = {
  beru: { species: 'beru', starter: true, price: 0 },
  hinar: { species: 'hinar', starter: true, price: 0 },
  behiv: { species: 'behiv', starter: true, price: 0 },
  bi: { species: 'bi', starter: true, price: 0 },
  tu: { species: 'tu', starter: false, price: 800 },
  spindar: { species: 'spindar', starter: false, price: 800 },
  kaj: { species: 'kaj', starter: false, price: 1000 },
  payiz: { species: 'payiz', starter: false, price: 1400 },
  miraz: { species: 'miraz', starter: false, price: 1800 },
  sev: { species: 'sev', starter: false, price: 2200 },
};

/**
 * How many times a tree has to have been watered to reach each stage. The
 * first water brings the seed up at once, the next stages come quickly, and
 * the last ones take weeks: a tree is soon worth looking at, and slow to
 * finish.
 */
export const TREE_GROWTH: readonly [number, number, number, number, number, number, number] = [0, 1, 3, 7, 14, 24, 38];

/** A full-grown tree bears every this many waterings, and what a harvest pays in Zêr. */
export const TREE_HARVEST_EVERY = 10;
export const TREE_HARVEST_ZER = 25;

/** Water a new tree is planted with: enough to bring its seed up. */
export const TREE_FIRST_WATER = 1;

/** The most water that can be poured in one go: more than anyone holds by learning, and a bound on what a request can ask for. */
export const TREE_POUR_MOST = 50;

/** Days without water after which a tree is thirsty, wilting, withered. */
export const TREE_DRY_DAYS = { thirsty: 2, wilting: 4, withered: 7 } as const;

/** The stage a tree watered `waterings` times has reached. */
export function treeStage(waterings: number): TreeStage {
  let stage = 0;
  for (let i = 1; i < TREE_STAGES; i++) if (waterings >= (TREE_GROWTH[i] as number)) stage = i;
  return stage as TreeStage;
}

/** Whole days from one calendar day to another, both written YYYY-MM-DD; never less than none. */
export function treeDaysBetween(from: string, to: string): number {
  const a = Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const b = Date.UTC(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  const days = Math.round((b - a) / 86_400_000);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/** How a tree is faring `days` after it was last watered. */
export function treeHealth(days: number): TreeHealth {
  if (days >= TREE_DRY_DAYS.withered) return 'withered';
  if (days >= TREE_DRY_DAYS.wilting) return 'wilting';
  if (days >= TREE_DRY_DAYS.thirsty) return 'thirsty';
  return 'fresh';
}

/** A tree as it is kept: what was planted, when, and what has been poured on it. */
export interface TreeRecord {
  species: TreeSpecies;
  /** the learner's own calendar day it was planted on, YYYY-MM-DD */
  plantedOn: string;
  /** the learner's own calendar day it last had water (the day it was planted, until then) */
  lastWateredOn: string;
  /** times it has been watered */
  waterings: number;
  /** water held and not yet poured */
  water: number;
  /** times it has borne, full grown */
  harvests: number;
}

/** A tree as it is shown. */
export interface TreeView extends TreeRecord {
  stage: TreeStage;
  health: TreeHealth;
  /** days since it last had water */
  dryDays: number;
  /** days it has stood */
  age: number;
  /**
   * How far it is to what comes next: waterings done and needed within this
   * stage, toward the next; full grown, toward its next harvest.
   */
  toward: { done: number; of: number; next: 'stage' | 'harvest' };
}

/** A tree as it is shown on `today` (the learner's own calendar day). */
export function treeView(tree: TreeRecord, today: string): TreeView {
  const stage = treeStage(tree.waterings);
  const dryDays = treeDaysBetween(tree.lastWateredOn, today);
  let toward: TreeView['toward'];
  if (stage < TREE_FULL) {
    const from = TREE_GROWTH[stage] as number;
    toward = { done: tree.waterings - from, of: (TREE_GROWTH[stage + 1] as number) - from, next: 'stage' };
  } else {
    toward = { done: (tree.waterings - (TREE_GROWTH[TREE_FULL] as number)) % TREE_HARVEST_EVERY, of: TREE_HARVEST_EVERY, next: 'harvest' };
  }
  // a seed asleep under the ground does not wilt: there is nothing of it to wilt yet
  return { ...tree, stage, health: stage === 0 ? 'fresh' : treeHealth(dryDays), dryDays, age: treeDaysBetween(tree.plantedOn, today), toward };
}

/** What pouring water on a tree did. */
export interface TreeWatering {
  tree: TreeRecord;
  /** how much was poured: no more than was held */
  poured: number;
  /** the stage it grew into, when it grew */
  grew: TreeStage | null;
  /** how many times it bore with this water, and what that pays in Zêr */
  harvests: number;
  zer: number;
  /** it had been wilting or withered, and this brought it back */
  revived: boolean;
}

/**
 * Pour `count` of the water held onto a tree on `today`. It grows by what it
 * is given, a full-grown tree bears each time its waterings since full growth
 * pass another `TREE_HARVEST_EVERY`, and whatever state it was in, it is
 * fresh again: water is never refused to a tree for having been neglected.
 */
export function waterTree(tree: TreeRecord, count: number, today: string): TreeWatering {
  const poured = Math.max(0, Math.min(Math.floor(count), tree.water, TREE_POUR_MOST));
  if (poured === 0) return { tree, poured: 0, grew: null, harvests: 0, zer: 0, revived: false };
  const before = treeView(tree, today);
  const waterings = tree.waterings + poured;
  const full = TREE_GROWTH[TREE_FULL] as number;
  const borne = (n: number): number => (n < full ? 0 : Math.floor((n - full) / TREE_HARVEST_EVERY));
  const harvests = borne(waterings) - borne(tree.waterings);
  const stage = treeStage(waterings);
  return {
    tree: { ...tree, waterings, water: tree.water - poured, lastWateredOn: today, harvests: tree.harvests + harvests },
    poured,
    grew: stage > before.stage ? stage : null,
    harvests,
    zer: harvests * TREE_HARVEST_ZER,
    revived: before.health === 'wilting' || before.health === 'withered',
  };
}

/** A tree newly planted on `today`: a seed, with the water to bring it up (or what was already held, if that is more). */
export function plantTree(species: TreeSpecies, today: string, held = 0): TreeRecord {
  return { species, plantedOn: today, lastWateredOn: today, waterings: 0, water: Math.max(held, TREE_FIRST_WATER), harvests: 0 };
}

/** Whether somebody who owns `owned` may plant a kind: a starter always, another once it is theirs. */
export function canPlant(species: TreeSpecies, owned: readonly string[]): boolean {
  return TREE_KINDS[species].starter || owned.includes(species);
}

/** A tree as anybody may see it on its owner's profile: what it is and how it stands, not what its owner holds. */
export interface TreeGlimpse {
  species: TreeSpecies;
  stage: TreeStage;
  health: TreeHealth;
  age: number;
  harvests: number;
}

export function treeGlimpse(view: TreeView): TreeGlimpse {
  return { species: view.species, stage: view.stage, health: view.health, age: view.age, harvests: view.harvests };
}

/**
 * The seasons a tree goes through, by the calendar of the learner's own
 * clock, as trees in Kurdistan do: blossom in spring, full green in summer,
 * turning in autumn, snow in winter (art/trees.ts draws each). A year's
 * seasons follow the months of the north, where the Kurdish lands are.
 */
export const TREE_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type TreeSeason = (typeof TREE_SEASONS)[number];

/** The season on a day: March to May spring, June to August summer, September to November autumn, December to February winter. */
export function treeSeasonAt(day: Date = new Date()): TreeSeason {
  const month = day.getMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}
