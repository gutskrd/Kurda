import { describe, expect, it } from 'vitest';
import {
  KINGDOM,
  KINGDOM_BUILDINGS,
  KINGDOM_LEVEL_TOTAL,
  NO_KINGDOM_LEVELS,
  VILLAGE_FEATURES,
  VILLAGE_GROWTH,
  buildingView,
  isKingdomBuilding,
  kingdomBuildings,
  kingdomLevelCount,
  kingdomLevels,
  kingdomRising,
  levelFor,
  newLevels,
  kingdomProgress,
  standingLevel,
  thresholdOf,
  villageFlock,
  villageGrowth,
  villageHas,
  villageLevelAt,
  villageStanding,
  villageXp,
  VILLAGE_LEVELS,
  VILLAGE_MAX_LEVEL,
  type KingdomCounts,
  type KingdomRecorded,
} from './index.js';

const zero: KingdomCounts = { houses: 0, school: 0, teahouse: 0, spring: 0, market: 0, orchard: 0 };

describe('the village’s buildings', () => {
  it('are six, each with five rising thresholds above nothing', () => {
    expect(KINGDOM_BUILDINGS).toEqual(['houses', 'school', 'teahouse', 'spring', 'market', 'orchard']);
    for (const b of KINGDOM_BUILDINGS) {
      const t = KINGDOM[b].thresholds;
      expect(t, b).toHaveLength(5);
      expect(t[0], b).toBeGreaterThan(0);
      for (let i = 1; i < t.length; i++) expect(t[i], `${b} ${i}`).toBeGreaterThan(t[i - 1]!);
    }
  });

  it('each count a different kind of learning', () => {
    expect(new Set(KINGDOM_BUILDINGS.map((b) => KINGDOM[b].measure)).size).toBe(6);
  });

  it('lands the school’s levels on the Road’s skill, unit and level boundaries', () => {
    // 12 units × 4 skills × 4 lessons: a skill, unit 1, the A1 units, the A2 units, all of it
    expect(KINGDOM.school.thresholds).toEqual([4, 16, 64, 144, 192]);
  });

  it('keeps the top of every item count within what the Road holds', () => {
    // listening 356, conversations 100, review items 2,633, starter stories per dialect 8–9
    expect(KINGDOM.spring.thresholds[4]).toBeLessThanOrEqual(356);
    expect(KINGDOM.market.thresholds[4]).toBeLessThanOrEqual(100);
    expect(KINGDOM.houses.thresholds[4]).toBeLessThanOrEqual(2633);
    expect(KINGDOM.teahouse.thresholds[4]).toBeLessThanOrEqual(8);
  });

  it('knows its own names and nothing else', () => {
    expect(isKingdomBuilding('spring')).toBe(true);
    expect(isKingdomBuilding('castle')).toBe(false);
    expect(isKingdomBuilding(3)).toBe(false);
  });
});

describe('levels', () => {
  it('rise at each threshold and stop at five', () => {
    expect(levelFor('school', 0)).toBe(0);
    expect(levelFor('school', 3)).toBe(0);
    expect(levelFor('school', 4)).toBe(1);
    expect(levelFor('school', 15)).toBe(1);
    expect(levelFor('school', 16)).toBe(2);
    expect(levelFor('school', 192)).toBe(5);
    expect(levelFor('school', 10_000)).toBe(5);
    expect(thresholdOf('school', 0)).toBe(0);
    expect(thresholdOf('school', 3)).toBe(64);
  });

  it('never fall below what was recorded', () => {
    expect(standingLevel('teahouse', 0, 3)).toBe(3);
    expect(standingLevel('teahouse', 6, 3)).toBe(4);
    expect(buildingView('teahouse', 1, 3)).toMatchObject({ level: 3, from: 4, next: 6, remaining: 5 });
  });

  it('say how far it is to the next one, and that a finished building has none', () => {
    expect(buildingView('orchard', 12, 0)).toEqual({ id: 'orchard', level: 2, count: 12, from: 10, next: 30, remaining: 18, place: 'lessons' });
    expect(buildingView('orchard', 400, 5)).toMatchObject({ level: 5, next: null, remaining: 0 });
    expect(kingdomProgress({ count: 20, from: 10, next: 30 })).toBe(0.5);
    expect(kingdomProgress({ count: 5, from: 10, next: 30 })).toBe(0);
    expect(kingdomProgress({ count: 400, from: 180, next: null })).toBe(1);
  });

  it('send each building to the part of Learn that grows it', () => {
    const places = Object.fromEntries(kingdomBuildings(zero, NO_KINGDOM_LEVELS).map((b) => [b.id, b.place]));
    expect(places).toEqual({ houses: 'review', school: 'lessons', teahouse: 'stories', spring: 'lessons', market: 'lessons', orchard: 'lessons' });
  });
});

describe('new levels', () => {
  it('are every level the counts reach and nothing has recorded, lowest first, in the village’s order', () => {
    const counts: KingdomCounts = { ...zero, school: 20, orchard: 3, houses: 12 };
    expect(newLevels(counts, NO_KINGDOM_LEVELS)).toEqual([
      { building: 'houses', level: 1 },
      { building: 'school', level: 1 },
      { building: 'school', level: 2 },
      { building: 'orchard', level: 1 },
    ]);
  });

  it('are none once recorded, and none for a building standing above its count', () => {
    const recorded: KingdomRecorded = { ...NO_KINGDOM_LEVELS, school: 2, teahouse: 4 };
    expect(newLevels({ ...zero, school: 20, teahouse: 1 }, recorded)).toEqual([]);
    expect(newLevels({ ...zero, school: 64 }, recorded)).toEqual([{ building: 'school', level: 3 }]);
  });

  it('read the levels a view stands at back for the drawing', () => {
    const view = kingdomBuildings({ ...zero, spring: 30 }, { ...NO_KINGDOM_LEVELS, market: 1 });
    expect(kingdomLevels(view)).toEqual({ houses: 0, school: 0, teahouse: 0, spring: 2, market: 1, orchard: 0 });
  });
});

describe('the village as it is drawn', () => {
  it('shows a building going up once the learner is half-way to its next level, and never a finished one', () => {
    // the school at 10 of 4–16 is half-way to level 2; the orchard at 4 of 3–10 is not; the market at 96 is finished
    const view = kingdomBuildings({ ...zero, school: 10, orchard: 4, market: 96 }, NO_KINGDOM_LEVELS);
    expect(kingdomRising(view)).toEqual(['school']);
    expect(kingdomRising(kingdomBuildings({ ...zero, houses: 6 }, NO_KINGDOM_LEVELS))).toEqual(['houses']);
    expect(kingdomRising(kingdomBuildings(zero, NO_KINGDOM_LEVELS))).toEqual([]);
  });

  it('counts the village’s levels out of all thirty', () => {
    expect(KINGDOM_LEVEL_TOTAL).toBe(30);
    expect(kingdomLevelCount(kingdomBuildings({ ...zero, school: 20, orchard: 3, houses: 12 }, NO_KINGDOM_LEVELS))).toBe(4);
    expect(kingdomLevelCount(kingdomBuildings({ houses: 1800, school: 192, teahouse: 8, spring: 340, market: 96, orchard: 180 }, NO_KINGDOM_LEVELS))).toBe(30);
  });
});

describe('the village’s own level, and how the valley fills in as it rises', () => {
  it('starts every village at level 1 with its camp, its plots and a shepherd, and brings something new with every level after', () => {
    expect(villageGrowth(1)).toEqual(['camp', 'plots', 'shepherd']);
    expect(villageGrowth(VILLAGE_MAX_LEVEL)).toEqual([...VILLAGE_FEATURES]);
    // listed in the order they come, every piece at one level, and every level from the second on brings at least one
    const at = VILLAGE_FEATURES.map((f) => VILLAGE_GROWTH[f]);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    for (let l = 1; l <= VILLAGE_MAX_LEVEL; l++) expect(at.filter((x) => x === l).length, `level ${l}`).toBeGreaterThan(0);
    expect(VILLAGE_LEVELS.map((l) => l.level)).toEqual(Array.from({ length: VILLAGE_MAX_LEVEL }, (_, i) => i + 1));
  });

  it('climbs a rising curve from nothing to every building finished, each step a little longer than the last', () => {
    const xp = VILLAGE_LEVELS.map((l) => l.xp);
    expect(xp[0]).toBe(0);
    expect(xp[xp.length - 1]).toBe(KINGDOM_LEVEL_TOTAL);
    // the second level is less than one building level away, so it comes on the first day
    expect(xp[1]).toBeLessThan(1);
    for (let i = 2; i < xp.length; i++) expect(xp[i]! - xp[i - 1]!, `level ${i + 1}`).toBeGreaterThanOrEqual(xp[i - 1]! - xp[i - 2]! - 0.011);
    expect(xp[xp.length - 1]! - xp[xp.length - 2]!).toBeGreaterThan((xp[2]! - xp[1]!) * 1.5);
  });

  it('counts every building’s level in full and its way to the next, so the first lesson already moves the bar', () => {
    expect(villageXp(kingdomBuildings(zero, NO_KINGDOM_LEVELS))).toBe(0);
    expect(villageStanding(kingdomBuildings(zero, NO_KINGDOM_LEVELS))).toMatchObject({ level: 1, share: 0 });
    // one lesson passed: a quarter of the school's way, a few listening and conversation answers right, the first day
    const first = kingdomBuildings({ ...zero, school: 1, spring: 3, market: 1, orchard: 1 }, NO_KINGDOM_LEVELS);
    const one = villageStanding(first);
    expect(one.xp).toBeCloseTo(0.25 + 3 / 8 + 0.5 + 1 / 3, 5);
    expect(one.level).toBe(2);
    expect(one.next?.unlocks).toEqual(['hens']);
    // a level recorded on the server counts in full even when its count has since shrunk
    const kept = villageXp(kingdomBuildings({ ...zero, teahouse: 0 }, { ...NO_KINGDOM_LEVELS, teahouse: 3 }));
    expect(kept).toBe(3);
    const done = kingdomBuildings({ houses: 9999, school: 999, teahouse: 99, spring: 999, market: 999, orchard: 999 }, NO_KINGDOM_LEVELS);
    expect(villageStanding(done)).toMatchObject({ level: VILLAGE_MAX_LEVEL, xp: 30, share: 1, next: null });
  });

  it('only ever adds as the level rises, and reads any number it is handed as a level from the first to the last', () => {
    for (let l = 1; l < VILLAGE_MAX_LEVEL; l++) {
      const now = villageGrowth(l);
      const next = villageGrowth(l + 1);
      expect(now.every((f) => next.includes(f)), `level ${l}`).toBe(true);
      expect(next.length, `level ${l}`).toBeGreaterThan(now.length);
      expect(villageLevelAt(VILLAGE_LEVELS[l]!.xp)).toBe(l + 1);
      expect(villageLevelAt(VILLAGE_LEVELS[l]!.xp - 0.01)).toBe(l);
    }
    expect(villageGrowth(-4)).toEqual(villageGrowth(1));
    expect(villageGrowth(99)).toEqual(villageGrowth(VILLAGE_MAX_LEVEL));
    expect(villageGrowth(Number.NaN)).toEqual(villageGrowth(1));
    expect(villageGrowth(11.9)).toEqual(villageGrowth(11));
    expect(villageHas(12, 'dock')).toBe(true);
    expect(villageHas(11, 'dock')).toBe(false);
    expect(villageLevelAt(Number.NaN)).toBe(1);
  });

  it('keeps a growing flock that never shrinks as the village grows', () => {
    expect(villageFlock(1)).toEqual({ campSheep: 2, sheep: 0, goats: 0, hens: 0, chicks: 0, cows: 0, donkeys: 0 });
    const full = villageFlock(VILLAGE_MAX_LEVEL);
    expect(full.sheep).toBeGreaterThanOrEqual(4);
    expect(full.cows).toBe(1);
    expect(full.donkeys).toBe(1);
    for (let t = 1; t < VILLAGE_MAX_LEVEL; t++) {
      const a = villageFlock(t);
      const b = villageFlock(t + 1);
      for (const k of Object.keys(a) as (keyof typeof a)[]) expect(b[k], `${k} at ${t + 1}`).toBeGreaterThanOrEqual(a[k]);
    }
  });
});
