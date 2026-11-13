import { describe, expect, it } from 'vitest';
import {
  TREE_DRY_DAYS,
  TREE_FIRST_WATER,
  TREE_FULL,
  TREE_GROWTH,
  TREE_HARVEST_EVERY,
  TREE_HARVEST_ZER,
  TREE_KINDS,
  TREE_POUR_MOST,
  TREE_SPECIES,
  TREE_STAGES,
  canPlant,
  isTreeSpecies,
  plantTree,
  treeDaysBetween,
  treeGlimpse,
  treeHealth,
  treeStage,
  treeView,
  waterTree,
  type TreeRecord,
} from './tree.js';

const tree = (over: Partial<TreeRecord> = {}): TreeRecord => ({ species: 'beru', plantedOn: '2026-11-01', lastWateredOn: '2026-11-10', waterings: 5, water: 3, harvests: 0, ...over });

describe('the kinds of tree', () => {
  it('has a kind for every key, a few of them free to start from and the rest at a price', () => {
    expect(Object.keys(TREE_KINDS)).toEqual([...TREE_SPECIES]);
    const starters = TREE_SPECIES.filter((k) => TREE_KINDS[k].starter);
    expect(starters.length).toBeGreaterThanOrEqual(3);
    for (const k of TREE_SPECIES) {
      expect(TREE_KINDS[k].species).toBe(k);
      expect(TREE_KINDS[k].price === 0).toBe(TREE_KINDS[k].starter);
      expect(Number.isInteger(TREE_KINDS[k].price)).toBe(true);
    }
    expect(isTreeSpecies('beru')).toBe(true);
    expect(isTreeSpecies('cactus')).toBe(false);
  });

  it('lets anybody plant a starter, and another kind only once it is theirs', () => {
    expect(canPlant('beru', [])).toBe(true);
    expect(canPlant('sev', [])).toBe(false);
    expect(canPlant('sev', ['sev'])).toBe(true);
  });
});

describe('a tree growing', () => {
  it('goes from a seed to the great tree in seven stages, each needing more water than the last', () => {
    expect(TREE_GROWTH).toHaveLength(TREE_STAGES);
    expect(TREE_GROWTH[0]).toBe(0);
    for (let i = 2; i < TREE_STAGES; i++) expect(TREE_GROWTH[i]! - TREE_GROWTH[i - 1]!).toBeGreaterThan(TREE_GROWTH[i - 1]! - TREE_GROWTH[i - 2]!);
    expect(treeStage(0)).toBe(0);
    expect(TREE_GROWTH.map((n) => treeStage(n))).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(TREE_GROWTH.slice(1).map((n) => treeStage(n - 1))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(treeStage(10_000)).toBe(TREE_FULL);
  });

  it('comes up at the first water it is given', () => {
    const planted = plantTree('hinar', '2026-11-13');
    expect(planted).toEqual({ species: 'hinar', plantedOn: '2026-11-13', lastWateredOn: '2026-11-13', waterings: 0, water: TREE_FIRST_WATER, harvests: 0 });
    expect(treeView(planted, '2026-11-13').stage).toBe(0);
    const watered = waterTree(planted, 1, '2026-11-13');
    expect(watered.grew).toBe(1);
    expect(watered.tree.water).toBe(0);
  });

  it('keeps water already held when another tree is planted, and never makes more of it', () => {
    expect(plantTree('bi', '2026-11-13', 4).water).toBe(4);
    expect(plantTree('bi', '2026-11-13', 0).water).toBe(TREE_FIRST_WATER);
  });

  it('says how far it is to the next stage, and full grown to the next harvest', () => {
    expect(treeView(tree({ waterings: 9 }), '2026-11-10').toward).toEqual({ done: 2, of: 7, next: 'stage' });
    const full = TREE_GROWTH[TREE_FULL];
    expect(treeView(tree({ waterings: full + 13 }), '2026-11-10').toward).toEqual({ done: 3, of: TREE_HARVEST_EVERY, next: 'harvest' });
  });
});

describe('watering', () => {
  it('pours no more than is held, and nothing changes when none is', () => {
    const dry = tree({ water: 0 });
    expect(waterTree(dry, 1, '2026-11-12')).toEqual({ tree: dry, poured: 0, grew: null, harvests: 0, zer: 0, revived: false });
    const some = waterTree(tree({ water: 2 }), 5, '2026-11-12');
    expect(some.poured).toBe(2);
    expect(some.tree).toMatchObject({ waterings: 7, water: 0, lastWateredOn: '2026-11-12' });
    expect(waterTree(tree({ water: 3 }), -4, '2026-11-12').poured).toBe(0);
    expect(waterTree(tree({ water: 3 }), 1.9, '2026-11-12').poured).toBe(1);
    expect(waterTree(tree({ water: 900 }), 900, '2026-11-12').poured).toBe(TREE_POUR_MOST);
  });

  it('says the stage it grew into, the last one when it passed more than one', () => {
    expect(waterTree(tree({ waterings: 6, water: 1 }), 1, '2026-11-12').grew).toBe(3);
    expect(waterTree(tree({ waterings: 5, water: 1 }), 1, '2026-11-12').grew).toBeNull();
    expect(waterTree(tree({ waterings: 0, water: 20 }), 20, '2026-11-12').grew).toBe(4);
  });

  it('bears each time a full-grown tree has had its fill again, and pays for each', () => {
    const full = TREE_GROWTH[TREE_FULL];
    const one = waterTree(tree({ waterings: full + 9, water: 1 }), 1, '2026-11-12');
    expect(one).toMatchObject({ harvests: 1, zer: TREE_HARVEST_ZER });
    expect(one.tree.harvests).toBe(1);
    expect(waterTree(tree({ waterings: full + 5, water: 30, harvests: 2 }), 30, '2026-11-12')).toMatchObject({ harvests: 3, zer: 3 * TREE_HARVEST_ZER });
    // growing into the great tree is not yet a harvest
    expect(waterTree(tree({ waterings: full - 1, water: 1 }), 1, '2026-11-12')).toMatchObject({ grew: TREE_FULL, harvests: 0, zer: 0 });
  });

  it('brings a wilting or withered tree back, with all it had grown', () => {
    const left = tree({ waterings: 30, lastWateredOn: '2026-10-01' });
    expect(treeView(left, '2026-11-12')).toMatchObject({ health: 'withered', stage: 5 });
    const back = waterTree(left, 1, '2026-11-12');
    expect(back.revived).toBe(true);
    expect(treeView(back.tree, '2026-11-12')).toMatchObject({ health: 'fresh', stage: 5, dryDays: 0 });
    expect(waterTree(tree({ lastWateredOn: '2026-11-10' }), 1, '2026-11-12').revived).toBe(false);
  });
});

describe('going without water', () => {
  it('is thirsty, then wilting, then withered, by the days since it last had water', () => {
    expect([0, 1].map(treeHealth)).toEqual(['fresh', 'fresh']);
    expect(treeHealth(TREE_DRY_DAYS.thirsty)).toBe('thirsty');
    expect(treeHealth(TREE_DRY_DAYS.wilting - 1)).toBe('thirsty');
    expect(treeHealth(TREE_DRY_DAYS.wilting)).toBe('wilting');
    expect(treeHealth(TREE_DRY_DAYS.withered - 1)).toBe('wilting');
    expect(treeHealth(TREE_DRY_DAYS.withered)).toBe('withered');
    expect(treeHealth(400)).toBe('withered');
  });

  it('counts days by the calendar, across months and years, and never backwards', () => {
    expect(treeDaysBetween('2026-11-10', '2026-11-10')).toBe(0);
    expect(treeDaysBetween('2026-10-30', '2026-11-02')).toBe(3);
    expect(treeDaysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(treeDaysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(treeDaysBetween('2026-11-12', '2026-11-10')).toBe(0);
    expect(treeDaysBetween('nonsense', '2026-11-10')).toBe(0);
  });

  it('leaves a seed under the ground as it is: there is nothing of it to wilt', () => {
    expect(treeView(tree({ waterings: 0, lastWateredOn: '2026-01-01' }), '2026-11-12')).toMatchObject({ stage: 0, health: 'fresh', dryDays: 315 });
  });

  it('shows on a profile what it is and how it stands, and nothing of what its owner holds', () => {
    const view = treeView(tree({ waterings: 15, water: 9, harvests: 0 }), '2026-11-13');
    expect(treeGlimpse(view)).toEqual({ species: 'beru', stage: 4, health: 'thirsty', age: 12, harvests: 0 });
  });
});
