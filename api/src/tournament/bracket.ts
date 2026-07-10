/**
 * Single-elimination bracket math (KUR-060). Pure and deterministic: given
 * rating-seeded participants it produces the standard seeded first round
 * (top seeds get the byes when the field isn't a power of two) and the rules
 * for propagating a winner up the tree. All persistence + orchestration lives
 * in the TournamentService — this module is just the shape of the bracket.
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

/**
 * Standard tournament seed order for a bracket of `size`: the seed number
 * occupying each position, arranged so seeds 1 and 2 can only meet in the
 * final. e.g. size 8 → [1,8,4,5,2,7,3,6].
 */
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

/**
 * Build the first-round pairings for the given seeds. Missing seeds (when the
 * field isn't a power of two) appear as `null`, which the service resolves as
 * a bye for the present player.
 */
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

/**
 * Where a completed match's winner goes: the parent match one round up sits at
 * `slot >> 1`, entering side `a` from even slots and side `b` from odd ones.
 */
export function parentSlot(slot: number): { slot: number; side: 'a' | 'b' } {
  return { slot: slot >> 1, side: slot % 2 === 0 ? 'a' : 'b' };
}

/**
 * Assign seeds by rating (highest rating = seed 1). Ties break by userId so
 * seeding is deterministic across runs.
 */
export function seedByRating(players: Array<{ userId: string; rating: number }>): Seed[] {
  return [...players]
    .sort((x, y) => y.rating - x.rating || x.userId.localeCompare(y.userId))
    .map((p, i) => ({ userId: p.userId, seed: i + 1 }));
}
