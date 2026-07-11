import { describe, expect, it } from 'vitest';
import {
  claimState,
  progressPct,
  questTitle,
  rewardLabel,
  sortQuests,
  type QuestView,
} from './quests.js';

function q(over: Partial<QuestView>): QuestView {
  return {
    id: 'x',
    type: 'earn_xp',
    target: 100,
    current: 0,
    complete: false,
    claimed: false,
    claimable: false,
    reward: {},
    ...over,
  };
}

describe('progressPct', () => {
  it('clamps to [0, 1]', () => {
    expect(progressPct({ current: 50, target: 100 })).toBe(0.5);
    expect(progressPct({ current: 150, target: 100 })).toBe(1);
    expect(progressPct({ current: -5, target: 100 })).toBe(0);
    expect(progressPct({ current: 5, target: 0 })).toBe(0);
  });
});

describe('questTitle', () => {
  it('prefers titleEn, falls back per type', () => {
    expect(questTitle(q({ titleEn: 'Welcome spring' }))).toBe('Welcome spring');
    expect(questTitle(q({ type: 'win_games', titleEn: undefined }))).toBe('Win games');
  });
});

describe('rewardLabel', () => {
  it('renders currencies present, joined', () => {
    expect(rewardLabel({ zer: 200, gems: 30 })).toBe('🪙 200 · 💎 30');
    expect(rewardLabel({ gems: 40 })).toBe('💎 40');
    expect(rewardLabel({})).toBe('');
  });
});

describe('claimState + sortQuests', () => {
  it('maps flags to a state', () => {
    expect(claimState(q({ claimed: true }))).toBe('claimed');
    expect(claimState(q({ claimable: true }))).toBe('claimable');
    expect(claimState(q({}))).toBe('locked');
  });

  it('orders claimable first, claimed last', () => {
    const claimed = q({ id: 'c', claimed: true });
    const locked = q({ id: 'l' });
    const claimable = q({ id: 'a', claimable: true });
    expect(sortQuests([claimed, locked, claimable]).map((x) => x.id)).toEqual(['a', 'l', 'c']);
  });
});
