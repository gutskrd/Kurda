import { describe, expect, it } from 'vitest';
import {
  BATTLE_PARTICIPATION_XP,
  BATTLE_WIN_XP,
  battleWinners,
  compareBattlePlayers,
  placementXp,
  rankBattle,
  type BattlePlayerResult,
} from './wordle-battle.js';

function player(
  userId: string,
  over: Partial<BattlePlayerResult> = {},
): BattlePlayerResult {
  return { userId, solved: true, guesses: 3, timeMs: 5000, progress: 5, ...over };
}

describe('compareBattlePlayers — tiebreak chain', () => {
  it('ranks a solver ahead of a non-solver regardless of their stats', () => {
    const solver = player('s', { solved: true, guesses: 6, timeMs: 99_000 });
    const nonSolver = player('n', { solved: false, guesses: 1, timeMs: 1000, progress: 4 });
    expect(compareBattlePlayers(solver, nonSolver)).toBeLessThan(0);
  });

  it('among solvers, fewer guesses wins', () => {
    const a = player('a', { guesses: 2, timeMs: 8000 });
    const b = player('b', { guesses: 4, timeMs: 1000 });
    expect(compareBattlePlayers(a, b)).toBeLessThan(0); // a ahead despite being slower
  });

  it('among solvers with equal guesses, faster time wins', () => {
    const a = player('a', { guesses: 3, timeMs: 4000 });
    const b = player('b', { guesses: 3, timeMs: 9000 });
    expect(compareBattlePlayers(a, b)).toBeLessThan(0);
  });

  it('among non-solvers, more progress wins', () => {
    const a = player('a', { solved: false, progress: 4 });
    const b = player('b', { solved: false, progress: 2 });
    expect(compareBattlePlayers(a, b)).toBeLessThan(0);
  });

  it('is 0 for indistinguishable players', () => {
    expect(compareBattlePlayers(player('a'), player('b'))).toBe(0);
  });
});

describe('rankBattle', () => {
  it('orders a mixed field by the full tiebreak chain', () => {
    const ranked = rankBattle([
      player('slow-solver', { solved: true, guesses: 3, timeMs: 9000 }),
      player('winner', { solved: true, guesses: 2, timeMs: 6000 }),
      player('loser', { solved: false, guesses: 6, timeMs: 12_000, progress: 3 }),
      player('fast-solver', { solved: true, guesses: 3, timeMs: 4000 }),
    ]);
    expect(ranked.map((p) => p.userId)).toEqual([
      'winner', // fewest guesses
      'fast-solver', // 3 guesses, faster
      'slow-solver', // 3 guesses, slower
      'loser', // didn't solve
    ]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 2, 3, 4]);
  });

  it('gives tied players the same rank and skips the next (competition ranking)', () => {
    const ranked = rankBattle([
      player('a', { guesses: 2, timeMs: 5000 }),
      player('b', { guesses: 2, timeMs: 5000 }), // exact tie with a
      player('c', { guesses: 4, timeMs: 5000 }),
    ]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 1, 3]);
  });

  it('does not mutate the input', () => {
    const input = [player('a', { guesses: 5 }), player('b', { guesses: 1 })];
    const copy = JSON.parse(JSON.stringify(input));
    rankBattle(input);
    expect(input).toEqual(copy);
  });

  it('handles an empty field', () => {
    expect(rankBattle([])).toEqual([]);
  });
});

describe('battleWinners', () => {
  it('returns the single rank-1 player', () => {
    const ranked = rankBattle([
      player('a', { guesses: 4 }),
      player('b', { guesses: 1 }),
    ]);
    expect(battleWinners(ranked).map((p) => p.userId)).toEqual(['b']);
  });

  it('returns everyone tied at rank 1', () => {
    const ranked = rankBattle([
      player('a', { guesses: 2, timeMs: 3000 }),
      player('b', { guesses: 2, timeMs: 3000 }),
    ]);
    expect(battleWinners(ranked).map((p) => p.userId).sort()).toEqual(['a', 'b']);
  });
});

describe('placementXp', () => {
  it('gives first place the win amount and last place participation', () => {
    expect(placementXp(1, 4)).toBe(BATTLE_WIN_XP);
    expect(placementXp(4, 4)).toBe(BATTLE_PARTICIPATION_XP);
  });

  it('decreases monotonically with worse placement', () => {
    const xps = [1, 2, 3, 4].map((r) => placementXp(r, 4));
    for (let i = 1; i < xps.length; i++) {
      expect(xps[i]!).toBeLessThan(xps[i - 1]!);
    }
  });

  it('awards the win amount in a solo/degenerate match', () => {
    expect(placementXp(1, 1)).toBe(BATTLE_WIN_XP);
  });

  it('clamps out-of-range ranks', () => {
    expect(placementXp(0, 4)).toBe(BATTLE_WIN_XP);
    expect(placementXp(99, 4)).toBe(BATTLE_PARTICIPATION_XP);
  });
});
