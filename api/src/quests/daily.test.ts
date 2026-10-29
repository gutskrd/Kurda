import { describe, expect, it } from 'vitest';
import { QUEST_KINDS, type QuestKind } from '@kurda/shared';
import { CHEST_ZER, chestAmount, chestTier, dayQuests, parseQuestId, pickQuests, questId, questMoves, questTarget, type QuestEvent } from './daily.js';

const USER = '0b6c1f8e-6d0a-4c51-9a35-2f1b3c4d5e6f';

/** Every day of 2026, for the picks' spread. */
const DAYS = Array.from({ length: 365 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));

describe('pickQuests', () => {
  it('gives the same three for the same learner and day, however often it is asked', () => {
    expect(pickQuests(USER, '2026-10-29')).toEqual(pickQuests(USER, '2026-10-29'));
  });

  it('always keeps the streak first, then two other kinds in the catalogue order', () => {
    for (const day of DAYS) {
      const kinds = pickQuests(USER, day).map((q) => q.kind);
      expect(kinds).toHaveLength(3);
      expect(kinds[0]).toBe('streak');
      expect(new Set(kinds).size).toBe(3);
      expect(QUEST_KINDS.indexOf(kinds[1]!)).toBeLessThan(QUEST_KINDS.indexOf(kinds[2]!));
    }
  });

  it('varies the pick across days and learners, and in time picks every kind', () => {
    const picks = new Set(DAYS.map((day) => pickQuests(USER, day).map((q) => q.kind).join()));
    // five kinds taken two at a time: ten pairs, all of them over a year
    expect(picks.size).toBe(10);
    const other = DAYS.map((day) => pickQuests('5e1d2c3b-4a59-4687-b6a5-948372615041', day).map((q) => q.kind).join());
    expect(other).not.toEqual(DAYS.map((day) => pickQuests(USER, day).map((q) => q.kind).join()));
  });

  it('sizes each quest within its range, with the chest its size earns', () => {
    const sizes = new Map<QuestKind, Set<number>>();
    for (const day of DAYS) {
      for (const quest of pickQuests(USER, day)) {
        sizes.set(quest.kind, (sizes.get(quest.kind) ?? new Set()).add(quest.target));
        expect(quest.chest).toBe(chestTier(quest.kind, quest.target));
      }
    }
    const sorted = (kind: QuestKind) => [...(sizes.get(kind) ?? [])].sort((a, b) => a - b);
    expect(sorted('streak')).toEqual([1]);
    expect(sorted('lessons')).toEqual([2, 3]);
    expect(sorted('accuracy')).toEqual([2]);
    expect(sorted('xp')).toEqual([30, 40, 50, 60]);
    expect(sorted('listening')).toEqual([5, 6, 7, 8]);
    expect(sorted('perfect')).toEqual([1]);
  });
});

describe('dayQuests', () => {
  it('sizes every kind for the day, the three picked as pickQuests gives them', () => {
    for (const day of DAYS.slice(0, 60)) {
      const all = dayQuests(USER, day);
      expect(all.map((q) => q.kind)).toEqual([...QUEST_KINDS]);
      expect(all.filter((q) => q.picked).map(({ kind, target, chest }) => ({ kind, target, chest }))).toEqual(pickQuests(USER, day));
    }
  });
});

describe('questTarget', () => {
  it('maps a hash word onto each kind range', () => {
    expect([0, 1].map((w) => questTarget('lessons', w))).toEqual([2, 3]);
    expect([0, 1, 2, 3].map((w) => questTarget('xp', w))).toEqual([30, 40, 50, 60]);
    expect([0, 1, 2, 3, 4].map((w) => questTarget('listening', w))).toEqual([5, 6, 7, 8, 5]);
    expect(questTarget('accuracy', 7)).toBe(2);
    expect(questTarget('streak', 7)).toBe(1);
    expect(questTarget('perfect', 7)).toBe(1);
  });
});

describe('chestTier', () => {
  it('pays more for more asked', () => {
    expect(chestTier('streak', 1)).toBe('common');
    expect(chestTier('lessons', 2)).toBe('common');
    expect(chestTier('lessons', 3)).toBe('rare');
    expect(chestTier('xp', 30)).toBe('common');
    expect(chestTier('xp', 40)).toBe('common');
    expect(chestTier('xp', 50)).toBe('rare');
    expect(chestTier('xp', 60)).toBe('rare');
    expect(chestTier('accuracy', 2)).toBe('rare');
    expect(chestTier('listening', 5)).toBe('rare');
    expect(chestTier('perfect', 1)).toBe('epic');
  });
});

describe('chestAmount', () => {
  it('is the same for the same learner and quest, and stays within its tier', () => {
    for (const tier of ['common', 'rare', 'epic'] as const) {
      const seen = new Set<number>();
      for (const day of DAYS) {
        const amount = chestAmount(tier, USER, questId(day, 'lessons'));
        expect(amount).toBe(chestAmount(tier, USER, questId(day, 'lessons')));
        expect(amount).toBeGreaterThanOrEqual(CHEST_ZER[tier].min);
        expect(amount).toBeLessThanOrEqual(CHEST_ZER[tier].max);
        seen.add(amount);
      }
      // every amount of the range turns up over a year
      expect(seen.size).toBe(CHEST_ZER[tier].max - CHEST_ZER[tier].min + 1);
    }
  });

  it('holds 5 to 10 Zêr in a common chest, 10 to 20 in a rare one and 20 to 35 in an epic one', () => {
    expect(CHEST_ZER).toEqual({ common: { min: 5, max: 10 }, rare: { min: 10, max: 20 }, epic: { min: 20, max: 35 } });
  });
});

describe('quest ids', () => {
  it('read back the day and kind they were made from', () => {
    expect(questId('2026-10-29', 'lessons')).toBe('2026-10-29:lessons');
    expect(parseQuestId('2026-10-29:lessons')).toEqual({ day: '2026-10-29', kind: 'lessons' });
  });

  it('name nothing when the day or the kind is not one', () => {
    for (const id of ['', '2026-10-29', '2026-10-29:', '2026-10-29:gems', '2026-02-30:xp', '2026-13-01:xp', '26-10-29:xp', '2026-10-29:xp:x', ' 2026-10-29:xp']) {
      expect(parseQuestId(id)).toBeNull();
    }
  });
});

describe('questMoves', () => {
  const event = (over: Partial<QuestEvent> = {}): QuestEvent => ({
    lesson: true,
    accuracy: 0.5,
    perfect: false,
    listeningRight: 0,
    xpToday: 0,
    ...over,
  });

  it('keeps the streak and sets the XP quest to the day total, never adding', () => {
    const moves = questMoves(event({ xpToday: 47 }));
    expect(moves.streak).toEqual({ add: 0, atLeast: 1 });
    expect(moves.xp).toEqual({ add: 0, atLeast: 47 });
  });

  it('counts a lesson, but not a practice session, towards the lesson quests', () => {
    expect(questMoves(event()).lessons.add).toBe(1);
    expect(questMoves(event({ lesson: false })).lessons.add).toBe(0);
    expect(questMoves(event({ perfect: true })).perfect.add).toBe(1);
    expect(questMoves(event({ lesson: false, perfect: true })).perfect.add).toBe(0);
  });

  it('counts 80% or more right towards accuracy, from a lesson or practice', () => {
    expect(questMoves(event({ accuracy: 0.79 })).accuracy.add).toBe(0);
    expect(questMoves(event({ accuracy: 0.8 })).accuracy.add).toBe(1);
    expect(questMoves(event({ lesson: false, accuracy: 1 })).accuracy.add).toBe(1);
  });

  it('adds the listening answers right', () => {
    expect(questMoves(event({ listeningRight: 3 })).listening).toEqual({ add: 3, atLeast: 0 });
  });
});
