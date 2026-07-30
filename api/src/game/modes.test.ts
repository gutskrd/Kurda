import { describe, expect, it } from 'vitest';
import { MODE_CONFIG, formTeams, teamScoreboard, type PlayerScoreLine } from './modes.js';

describe('MODE_CONFIG', () => {
  it('defines 1v1, 2v2 and FFA-up-to-8', () => {
    expect(MODE_CONFIG['1v1']).toMatchObject({ players: 2, teamSize: 1 });
    expect(MODE_CONFIG['2v2']).toMatchObject({ players: 4, teamSize: 2 });
    expect(MODE_CONFIG.ffa).toMatchObject({ players: 8, teamSize: 1 });
  });
});

describe('formTeams', () => {
  it('gives each player their own team in solo modes', () => {
    expect(formTeams(['a', 'b'], '1v1')).toEqual([['a'], ['b']]);
    expect(formTeams(['a', 'b', 'c'], 'ffa')).toEqual([['a'], ['b'], ['c']]);
  });

  it('pairs consecutive players into teams of two for 2v2', () => {
    expect(formTeams(['a', 'b', 'c', 'd'], '2v2')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });
});

describe('teamScoreboard', () => {
  const line = (userId: string, points: number, cumulativeMs: number, correct: number): PlayerScoreLine => ({
    userId, points, cumulativeMs, correct,
  });

  it('sums member points into a team total and ranks teams', () => {
    const ranked = teamScoreboard(
      [line('a', 600, 3000, 1), line('b', 900, 4000, 2), line('c', 500, 2000, 1), line('d', 400, 2500, 1)],
      [['a', 'b'], ['c', 'd']],
    );
    expect(ranked[0]).toMatchObject({ points: 1500, rank: 1, members: ['a', 'b'] });
    expect(ranked[1]).toMatchObject({ points: 900, rank: 2 });
  });

  it('scores a team on whoever played when a member is absent (0 for the missing one)', () => {
    // 'b' disconnected → not in perPlayer → contributes 0
    const ranked = teamScoreboard(
      [line('a', 700, 3000, 2), line('c', 400, 2000, 1), line('d', 300, 2200, 1)],
      [['a', 'b'], ['c', 'd']],
    );
    const teamAB = ranked.find((t) => t.members.includes('a'))!;
    expect(teamAB.points).toBe(700); // only a's points; b absent
    expect(teamAB.rank).toBe(1); // still beats c+d (700)
  });

  it('breaks a team points tie by lower cumulative time', () => {
    const ranked = teamScoreboard(
      [line('a', 500, 5000, 1), line('c', 500, 2000, 1)],
      [['a'], ['c']],
    );
    expect(ranked[0]!.members).toEqual(['c']); // same points, faster
  });
});
