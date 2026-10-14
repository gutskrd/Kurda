import { describe, expect, it } from 'vitest';
import { RANK_TIER_KEYS, badgeDef } from '@kurda/shared';
import { rankTierIndex, rankTierIndexSql, ratedGameForBadges } from './rank-hooks.js';

describe('rank hooks: Game Ranks as the badges count it', () => {
  it('counts each tier key as its place in the climb, and each has its emblem badge and measure', () => {
    expect(RANK_TIER_KEYS.map((k) => rankTierIndex(k))).toEqual([0, 1, 2, 3, 4, 5]);
    for (const [i, key] of RANK_TIER_KEYS.entries()) {
      expect(rankTierIndex(key)).toBe(i);
      expect(badgeDef(`rank-${key}`)?.measure, key).toBe(`seasons_reached_${key}`);
      expect(rankTierIndexSql('t')).toContain(`WHEN '${key}' THEN ${i}`);
    }
    expect(rankTierIndex(null)).toBeNull();
    expect(rankTierIndex('bronze')).toBeNull();
  });

  it('turns a rated game into the badges’ record: tiers as indices, placed once a tier is shown, the gap as told', () => {
    const at = new Date('2026-10-01T12:00:00Z');
    const base = { won: false, left: false, pointsBefore: 0, pointsAfter: 0, ratedGames: 5, seasonGames: 5, placedNow: false };
    const out = ratedGameForBadges({
      game: 'rhyme-match',
      gameRef: 'g1',
      seasonId: '2026-Q4',
      at,
      players: [
        { ...base, userId: 'a', place: 1, won: true, tierBefore: 'dest', tierAfter: 'gir', beatTierGap: 3, placedNow: false },
        { ...base, userId: 'b', place: 2, tierBefore: 'ciya', tierAfter: 'ciya', beatTierGap: 0 },
        { ...base, userId: 'c', place: 3, left: true, tierBefore: null, tierAfter: null, beatTierGap: 0, ratedGames: 2 },
      ],
    });
    expect(out).toEqual({
      game: 'rhyme-match',
      gameRef: 'g1',
      seasonId: '2026-Q4',
      finishedAt: at,
      players: [
        { userId: 'a', place: 1, left: false, tierBefore: 0, tierAfter: 1, placementDone: true, beatTierGap: 3 },
        { userId: 'b', place: 2, left: false, tierBefore: 3, tierAfter: 3, placementDone: true, beatTierGap: 0 },
        { userId: 'c', place: 3, left: true, tierBefore: null, tierAfter: null, placementDone: false, beatTierGap: 0 },
      ],
    });
  });
});
