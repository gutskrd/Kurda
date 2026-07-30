import { describe, expect, it } from 'vitest';
import {
  applyResults,
  expectedScore,
  kFactor,
  DEFAULT_RATING,
  PLACEMENT_GAMES,
  K_PLACEMENT,
  K_BASE,
  K_FLOOR,
  type RatingPlayer,
} from './elo.js';

const player = (over: Partial<RatingPlayer>): RatingPlayer => ({
  userId: 'u',
  rating: DEFAULT_RATING,
  gamesPlayed: PLACEMENT_GAMES,
  rank: 1,
  forfeit: false,
  ...over,
});

describe('expectedScore', () => {
  it('is 0.5 for equal ratings', () => {
    expect(expectedScore(1000, 1000)).toBeCloseTo(0.5, 5);
  });
  it('favours the higher-rated player and is symmetric', () => {
    const strong = expectedScore(1200, 1000);
    expect(strong).toBeGreaterThan(0.5);
    expect(strong + expectedScore(1000, 1200)).toBeCloseTo(1, 5);
  });
});

describe('kFactor', () => {
  it('is highest during placement', () => {
    expect(kFactor(0)).toBe(K_PLACEMENT);
    expect(kFactor(PLACEMENT_GAMES - 1)).toBe(K_PLACEMENT);
  });
  it('drops to the base right after placement then decays to the floor', () => {
    expect(kFactor(PLACEMENT_GAMES)).toBe(K_BASE);
    expect(kFactor(1000)).toBe(K_FLOOR);
    // monotonic non-increasing across the decay span
    expect(kFactor(PLACEMENT_GAMES + 15)).toBeLessThan(K_BASE);
    expect(kFactor(PLACEMENT_GAMES + 15)).toBeGreaterThan(K_FLOOR);
  });
});

describe('applyResults — 1v1', () => {
  it('is zero-sum for evenly-matched players', () => {
    const [winner, loser] = applyResults([
      player({ userId: 'a', rank: 1 }),
      player({ userId: 'b', rank: 2 }),
    ]);
    expect(winner!.delta).toBe(-loser!.delta);
    expect(winner!.delta).toBeGreaterThan(0);
    expect(winner!.newRating).toBe(DEFAULT_RATING + winner!.delta);
  });

  it('rewards an underdog win more than a favourite win', () => {
    const [underdog] = applyResults([
      player({ userId: 'a', rating: 900, rank: 1 }),
      player({ userId: 'b', rating: 1200, rank: 2 }),
    ]);
    const [favourite] = applyResults([
      player({ userId: 'a', rating: 1200, rank: 1 }),
      player({ userId: 'b', rating: 900, rank: 2 }),
    ]);
    expect(underdog!.delta).toBeGreaterThan(favourite!.delta);
  });

  it('swings ratings harder for players still in placement', () => {
    const [placing] = applyResults([
      player({ userId: 'a', rank: 1, gamesPlayed: 0 }),
      player({ userId: 'b', rank: 2, gamesPlayed: 0 }),
    ]);
    const [settled] = applyResults([
      player({ userId: 'a', rank: 1, gamesPlayed: 100 }),
      player({ userId: 'b', rank: 2, gamesPlayed: 100 }),
    ]);
    expect(placing!.delta).toBeGreaterThan(settled!.delta);
  });
});

describe('applyResults — forfeit dampening', () => {
  it('softens the forfeiter loss but leaves the winner gain intact', () => {
    const [, honestLoser] = applyResults([
      player({ userId: 'a', rank: 1 }),
      player({ userId: 'b', rank: 2, forfeit: false }),
    ]);
    const [winner, quitter] = applyResults([
      player({ userId: 'a', rank: 1 }),
      player({ userId: 'b', rank: 2, forfeit: true }),
    ]);
    // the quitter loses fewer points than the honest loser…
    expect(quitter!.delta).toBeGreaterThan(honestLoser!.delta);
    expect(quitter!.delta).toBeLessThan(0);
    // …and the opponent's win is unaffected
    expect(winner!.delta).toBeGreaterThan(0);
  });

  it('never dampens a positive delta', () => {
    const [winner] = applyResults([
      player({ userId: 'a', rank: 1, forfeit: true }),
      player({ userId: 'b', rank: 2 }),
    ]);
    expect(winner!.delta).toBeGreaterThan(0);
  });
});

describe('applyResults — multiplayer (FFA)', () => {
  it('ranks deltas by finishing position and roughly conserves points', () => {
    const results = applyResults([
      player({ userId: 'a', rank: 1 }),
      player({ userId: 'b', rank: 2 }),
      player({ userId: 'c', rank: 3 }),
      player({ userId: 'd', rank: 4 }),
    ]);
    const byUser = Object.fromEntries(results.map((r) => [r.userId, r.delta])) as Record<string, number>;
    expect(byUser.a!).toBeGreaterThan(byUser.b!);
    expect(byUser.b!).toBeGreaterThan(byUser.c!);
    expect(byUser.c!).toBeGreaterThan(byUser.d!);
    expect(byUser.a!).toBeGreaterThan(0);
    expect(byUser.d!).toBeLessThan(0);
    // equal ratings → symmetric field → sum stays within rounding noise
    const sum = results.reduce((s, r) => s + r.delta, 0);
    expect(Math.abs(sum)).toBeLessThanOrEqual(results.length);
  });
});
