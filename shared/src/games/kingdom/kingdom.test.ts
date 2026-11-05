import { describe, expect, it } from 'vitest';
import {
  KINGDOM,
  KINGDOM_BUILDINGS,
  NO_KINGDOM_LEVELS,
  buildingView,
  isKingdomBuilding,
  kingdomBuildings,
  kingdomLevels,
  levelFor,
  newLevels,
  progressToNext,
  standingLevel,
  thresholdOf,
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
    expect(progressToNext({ count: 20, from: 10, next: 30 })).toBe(0.5);
    expect(progressToNext({ count: 5, from: 10, next: 30 })).toBe(0);
    expect(progressToNext({ count: 400, from: 180, next: null })).toBe(1);
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
