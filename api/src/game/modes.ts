/**
 * Game modes: 1v1, team-of-2, free-for-all up to 8 (KUR-055). Pure grouping +
 * team-score aggregation on top of the 1v1 engine, unit-tested.
 */
import { rankScores, type RankedScore } from './scoring.js';

/** A per-player line the team aggregator reads. */
export interface PlayerScoreLine {
  userId: string;
  points: number;
  cumulativeMs: number;
  correct: number;
}

export type GameMode = '1v1' | '2v2' | 'ffa';

export interface ModeConfig {
  /** players needed to start at full capacity */
  players: number;
  /** members per team (1 = solo/FFA) */
  teamSize: number;
  /** minimum players to start once the wait times out (FFA fills up to `players`) */
  min: number;
}

export const MODE_CONFIG: Record<GameMode, ModeConfig> = {
  '1v1': { players: 2, teamSize: 1, min: 2 },
  '2v2': { players: 4, teamSize: 2, min: 4 },
  ffa: { players: 8, teamSize: 1, min: 3 },
};

/**
 * Split an ordered list of player ids into teams for the mode. Solo modes
 * (1v1, FFA) put each player on their own team of one; 2v2 pairs consecutive
 * players. The caller has already picked exactly `players` (or, for FFA,
 * `min`..`players`) ids.
 */
export function formTeams(playerIds: string[], mode: GameMode): string[][] {
  const { teamSize } = MODE_CONFIG[mode];
  if (teamSize <= 1) return playerIds.map((id) => [id]);
  const teams: string[][] = [];
  for (let i = 0; i < playerIds.length; i += teamSize) {
    teams.push(playerIds.slice(i, i + teamSize));
  }
  return teams;
}

export interface TeamLine {
  teamId: string;
  members: string[];
  points: number;
  cumulativeMs: number;
  correct: number;
}

/**
 * Aggregate per-player scores into per-team totals (team score = sum of its
 * members) and rank them. A disconnected/absent member simply contributes 0,
 * so their team is scored on whoever kept playing (KUR-055 edge case).
 */
export function teamScoreboard(
  perPlayer: PlayerScoreLine[],
  teams: string[][],
): Array<RankedScore<TeamLine>> {
  const byId = new Map(perPlayer.map((p) => [p.userId, p]));
  const lines: TeamLine[] = teams.map((members, i) => {
    let points = 0;
    let cumulativeMs = 0;
    let correct = 0;
    for (const id of members) {
      const p = byId.get(id);
      if (!p) continue; // absent member contributes 0
      points += p.points;
      cumulativeMs += p.cumulativeMs;
      correct += p.correct;
    }
    return { teamId: `team-${i + 1}`, members, points, cumulativeMs, correct };
  });
  return rankScores(lines);
}
