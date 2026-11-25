import { describe, expect, it } from 'vitest';
import { BADGE_ROW_MAX, badgeRow, badgesInOrder } from './collection.js';
import type { ProfileBadge } from './badges.js';

const earned = (key: string): ProfileBadge => ({ key, family: 'learning', tier: 1, tierKey: 'sifir', earnedAt: null, rarity: null });
const tree = { species: 'hinar', stage: 3, health: 'fresh', age: 9, harvests: 0 } as const;

describe('the badge row', () => {
  it('puts the chosen three first, in their order, then the other earned badges as they came', () => {
    const all = ['a', 'b', 'c', 'd', 'e'].map(earned);
    expect(badgesInOrder([earned('d'), earned('b')], all).map((b) => b.key)).toEqual(['d', 'b', 'a', 'c', 'e']);
  });

  it('shows only the three where the server sends no more', () => {
    expect(badgesInOrder([earned('b')]).map((b) => b.key)).toEqual(['b']);
    expect(badgesInOrder()).toEqual([]);
  });

  it('shows the top three, the chosen badges first, and counts the rest', () => {
    const badges = ['a', 'b', 'c', 'd', 'e', 'f'].map(earned);
    const row = badgeRow({ league: 'cem', tree, badges });
    expect(row.shown.map((i) => i.kind)).toEqual(['badge', 'badge', 'badge']);
    expect(row.shown).toHaveLength(BADGE_ROW_MAX);
    expect(row.more).toBe(5);
  });

  it('fills the three with the league and the tree when there are few badges', () => {
    const row = badgeRow({ league: 'cem', tree, badges: [earned('a')] });
    expect(row.shown.map((i) => i.kind)).toEqual(['badge', 'league', 'tree']);
    expect(row.more).toBe(0);
  });

  it('leaves out a tree it cannot draw, and a league nobody is in', () => {
    const row = badgeRow({ league: null, tree: { ...tree, species: 'oak' as never }, badges: [earned('a')] });
    expect(row).toEqual({ shown: [{ kind: 'badge', badge: earned('a') }], more: 0 });
  });
});
