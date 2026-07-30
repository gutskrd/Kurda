import { describe, expect, it } from 'vitest';
import {
  claimBlock,
  claimDeadline,
  evaluateQuest,
  parseQuest,
  parseQuests,
  QUEST_GRACE_HOURS,
  type QuestDef,
} from './quest-logic.js';

describe('parseQuest', () => {
  it('normalizes a valid quest and floors counts/rewards', () => {
    const q = parseQuest({ id: 'x', type: 'earn_xp', count: 300.9, reward: { gems: 30.5, zer: 0 }, titleEn: 'Earn' });
    expect(q).toEqual({ id: 'x', type: 'earn_xp', count: 300, reward: { gems: 30 }, titleEn: 'Earn', titleKu: undefined });
  });

  it('rejects unknown types, missing id, and non-positive counts', () => {
    expect(parseQuest({ id: 'x', type: 'streak', count: 3 })).toBeNull();
    expect(parseQuest({ type: 'earn_xp', count: 3 })).toBeNull();
    expect(parseQuest({ id: 'x', type: 'earn_xp', count: 0 })).toBeNull();
    expect(parseQuest('nope')).toBeNull();
  });

  it('parseQuests keeps only valid quests, preserving order', () => {
    const quests = parseQuests([
      { id: 'a', type: 'earn_xp', count: 100, reward: {} },
      { id: 'skip', type: 'mystery', count: 1 },
      { id: 'b', type: 'win_games', count: 3, reward: { zer: 50 } },
    ]);
    expect(quests.map((q) => q.id)).toEqual(['a', 'b']);
  });
});

describe('evaluateQuest', () => {
  const def: QuestDef = { id: 'g', type: 'win_games', count: 3, reward: { gems: 40 } };

  it('caps current at the target and flags completion', () => {
    expect(evaluateQuest(def, 1)).toMatchObject({ current: 1, target: 3, complete: false });
    expect(evaluateQuest(def, 3)).toMatchObject({ current: 3, complete: true });
    expect(evaluateQuest(def, 5)).toMatchObject({ current: 3, complete: true }); // capped
  });

  it('never reports negative progress', () => {
    expect(evaluateQuest(def, -2).current).toBe(0);
  });
});

describe('claimBlock', () => {
  const endsAt = Date.parse('2026-03-24T00:00:00.000Z');
  const graceMs = QUEST_GRACE_HOURS * 3_600_000;

  it('refuses an incomplete quest', () => {
    expect(claimBlock(false, endsAt, endsAt - 1000)).toBe('NOT_COMPLETE');
  });

  it('allows a complete quest mid-event and through the grace window', () => {
    expect(claimBlock(true, endsAt, endsAt - 3_600_000)).toBeNull(); // during event
    expect(claimBlock(true, endsAt, endsAt + graceMs - 1000)).toBeNull(); // inside grace
  });

  it('refuses once the 72h grace has passed', () => {
    expect(claimDeadline(endsAt)).toBe(endsAt + graceMs);
    expect(claimBlock(true, endsAt, endsAt + graceMs + 1000)).toBe('GRACE_EXPIRED');
  });
});
