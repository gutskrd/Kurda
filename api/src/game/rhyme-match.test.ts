import { describe, expect, it } from 'vitest';
import { compareRhymePlayers, rankRhyme, rhymePlacementXp, RHYME_PARTICIPATION_XP, RHYME_WIN_XP, type RhymeMatchPlayerResult } from './rhyme-match.js';

const p = (userId: string, score: number, accepted: number): RhymeMatchPlayerResult => ({ userId, score, accepted });

describe('compareRhymePlayers', () => {
  it('orders by score desc, then fewer submissions', () => {
    expect(compareRhymePlayers(p('a', 30, 3), p('b', 20, 1))).toBeLessThan(0); // higher score first
    expect(compareRhymePlayers(p('a', 20, 2), p('b', 20, 5))).toBeLessThan(0); // tie → fewer submissions first
    expect(compareRhymePlayers(p('a', 20, 3), p('b', 20, 3))).toBe(0);
  });
});

describe('rankRhyme', () => {
  it('assigns competition ranks with shared ties (1,2,2,4)', () => {
    const ranked = rankRhyme([p('a', 10, 2), p('b', 30, 3), p('c', 20, 2), p('d', 20, 2)]);
    const byId = Object.fromEntries(ranked.map((r) => [r.userId, r.rank]));
    expect(byId.b).toBe(1); // 30
    expect(byId.c).toBe(2); // 20, 2 subs
    expect(byId.d).toBe(2); // tie
    expect(byId.a).toBe(4); // rank skips to 4 after the tie
  });
  it('does not mutate the input', () => {
    const input = [p('a', 1, 1), p('b', 2, 1)];
    const copy = [...input];
    rankRhyme(input);
    expect(input).toEqual(copy);
  });
});

describe('rhymePlacementXp', () => {
  it('scales win → participation by rank; 1-player edge earns the win amount', () => {
    expect(rhymePlacementXp(1, 4)).toBe(RHYME_WIN_XP);
    expect(rhymePlacementXp(4, 4)).toBe(RHYME_PARTICIPATION_XP);
    expect(rhymePlacementXp(1, 1)).toBe(RHYME_WIN_XP);
    const mid = rhymePlacementXp(2, 4);
    expect(mid).toBeGreaterThan(RHYME_PARTICIPATION_XP);
    expect(mid).toBeLessThan(RHYME_WIN_XP);
  });
});
