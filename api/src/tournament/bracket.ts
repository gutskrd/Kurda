/**
 * Pure single-elimination bracket math: the seeded first round from rating-seeded players (top seeds get byes when the
 * field is not a power of two) and how winners move up the tree. Persistence lives in TournamentService.
 */

export interface Seed {
  userId: string;
  /** 1-based; seed 1 is the strongest (highest rating). */
  seed: number;
}

export interface FirstRoundMatch {
  slot: number;
  /** userId, or null when the seeded position is a bye. */
  a: string | null;
  b: string | null;
}

/** Smallest power of two ≥ n (the bracket size that fits everyone). */
export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return size;
}

/** Number of rounds for a bracket of `size` (a power of two). */
export function roundsForSize(size: number): number {
  return Math.log2(size);
}

/** Standard seed order for a bracket of `size`, placing seeds so 1 and 2 can meet only in the final; size 8 gives [1,8,4,5,2,7,3,6]. */
export function seedOrder(size: number): number[] {
  let positions = [1, 2];
  while (positions.length < size) {
    const sum = positions.length * 2 + 1;
    const next: number[] = [];
    for (const p of positions) {
      next.push(p);
      next.push(sum - p);
    }
    positions = next;
  }
  return positions;
}

/** First-round pairings for the seeds; missing seeds (a field below a power of two) are null, which the service treats as a bye. */
export function firstRoundMatches(seeds: Seed[]): FirstRoundMatch[] {
  const size = nextPowerOfTwo(seeds.length);
  const order = seedOrder(size);
  const bySeed = new Map(seeds.map((s) => [s.seed, s.userId]));

  const matches: FirstRoundMatch[] = [];
  for (let i = 0; i < size / 2; i++) {
    const aSeed = order[2 * i]!;
    const bSeed = order[2 * i + 1]!;
    matches.push({
      slot: i,
      a: bySeed.get(aSeed) ?? null,
      b: bySeed.get(bSeed) ?? null,
    });
  }
  return matches;
}

/** Where a match winner goes: the parent one round up at `slot >> 1`, on side `a` from even slots and `b` from odd ones. */
export function parentSlot(slot: number): { slot: number; side: 'a' | 'b' } {
  return { slot: slot >> 1, side: slot % 2 === 0 ? 'a' : 'b' };
}

/** Seeds by rating, highest first, with ties broken by user id so seeding is deterministic. */
export function seedByRating(players: Array<{ userId: string; rating: number }>): Seed[] {
  return [...players]
    .sort((x, y) => y.rating - x.rating || x.userId.localeCompare(y.userId))
    .map((p, i) => ({ userId: p.userId, seed: i + 1 }));
}
