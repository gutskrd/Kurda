/**
 * Rhyme multiplayer (1v1 / free-for-all) placement — pure comparator + ranking
 * for a match where every player raced the same prompt within one timed window
 * (KUR-299). The server drives the match (session engine #051, realtime #049);
 * this decides the finishing order + placement XP, fully unit-testable.
 *
 * Order: highest score first; if tied, the player who needed fewer submissions
 * (more efficient) ranks higher; still tied → share a rank.
 */

export interface RhymeMatchPlayerResult {
  userId: string;
  score: number;
  /** number of accepted rhymes submitted */
  accepted: number;
}

export interface RankedRhymePlayer extends RhymeMatchPlayerResult {
  /** 1-based; ties share a rank (standard competition ranking: 1,2,2,4) */
  rank: number;
}

export function compareRhymePlayers(a: RhymeMatchPlayerResult, b: RhymeMatchPlayerResult): number {
  if (a.score !== b.score) return b.score - a.score; // higher score wins
  if (a.accepted !== b.accepted) return a.accepted - b.accepted; // fewer submissions = more efficient
  return 0;
}

/** Rank all players, standard competition ranking (1,2,2,4). Input not mutated. */
export function rankRhyme(players: readonly RhymeMatchPlayerResult[]): RankedRhymePlayer[] {
  const sorted = [...players].sort(compareRhymePlayers);
  const ranked: RankedRhymePlayer[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const player = sorted[i]!;
    const prevRaw = sorted[i - 1];
    const tiedWithPrev = prevRaw !== undefined && compareRhymePlayers(prevRaw, player) === 0;
    const rank = tiedWithPrev ? ranked[i - 1]!.rank : i + 1;
    ranked.push({ ...player, rank });
  }
  return ranked;
}

export const RHYME_PARTICIPATION_XP = 15;
export const RHYME_WIN_XP = 80;

/**
 * Placement XP: 1st earns RHYME_WIN_XP, last earns RHYME_PARTICIPATION_XP, places
 * between scale linearly by rank. A 1-player edge earns the win amount.
 */
export function rhymePlacementXp(rank: number, playerCount: number): number {
  if (playerCount <= 1) return RHYME_WIN_XP;
  const clamped = Math.min(Math.max(rank, 1), playerCount);
  const spread = RHYME_WIN_XP - RHYME_PARTICIPATION_XP;
  return Math.round(RHYME_PARTICIPATION_XP + (spread * (playerCount - clamped)) / (playerCount - 1));
}
