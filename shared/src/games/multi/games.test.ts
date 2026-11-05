import { describe, expect, it } from 'vitest';
import { PLAY_GAMES, isPlayGame } from '../../play.js';
import { RANKED_GAMES } from '../../ranks.js';
import { invitePath, parseInvite } from '../../game-invites.js';
import {
  MULTI_GAMES,
  PLACEMENT_LAST_XP,
  PLACEMENT_WIN_XP,
  isMultiGame,
  paidPlacementXp,
  placementXp,
  repeatOpponentShare,
} from './games.js';

describe('the multiplayer games', () => {
  it('are play games, ranked games and invite targets, from the one list', () => {
    for (const g of MULTI_GAMES) {
      expect(PLAY_GAMES).toContain(g);
      expect(isPlayGame(g)).toBe(true);
      expect(RANKED_GAMES).toContain(g);
      expect(parseInvite(invitePath({ type: g, id: 'abcdef12' }))).toEqual({ type: g, id: 'abcdef12' });
    }
    expect(isMultiGame('last-letter')).toBe(true);
    expect(isMultiGame('stories')).toBe(false);
  });
});

describe('placement XP', () => {
  it('pays first the most and last the least, in even steps', () => {
    expect(placementXp(1, 2)).toBe(PLACEMENT_WIN_XP);
    expect(placementXp(2, 2)).toBe(PLACEMENT_LAST_XP);
    expect(placementXp(2, 3)).toBe(Math.round((PLACEMENT_WIN_XP + PLACEMENT_LAST_XP) / 2));
    expect(placementXp(9, 3)).toBe(PLACEMENT_LAST_XP);
  });

  it('pays nothing for a game with nobody to place against', () => {
    expect(placementXp(1, 1)).toBe(0);
  });

  it('pays less for the same opponents again the same day, then nothing', () => {
    expect([0, 1, 2, 3, 4, 9].map(repeatOpponentShare)).toEqual([1, 1, 0.5, 0.25, 0, 0]);
    expect(paidPlacementXp(1, 2, 0)).toBe(PLACEMENT_WIN_XP);
    expect(paidPlacementXp(1, 2, 2)).toBe(PLACEMENT_WIN_XP / 2);
    expect(paidPlacementXp(1, 2, 4)).toBe(0);
  });
});
