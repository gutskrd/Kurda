/**
 * Pure search helpers for the dictionary (KUR-044). Edit distance backs the
 * fuzzy fallback (accepts a single typo). Kept pure and unit-tested.
 */

/** Levenshtein distance, capped: returns >maxDistance as soon as it's exceeded. */
export function boundedEditDistance(a: string, b: string, maxDistance: number): number {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  if (a === b) return 0;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      if (curr[j]! < rowMin) rowMin = curr[j]!;
    }
    if (rowMin > maxDistance) return maxDistance + 1; // whole row exceeded the cap
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/** True when `a` and `b` differ by at most one edit (insert/delete/substitute). */
export function isWithinOneEdit(a: string, b: string): boolean {
  return boundedEditDistance(a, b, 1) <= 1;
}

/** A query is searchable if it has at least one letter/digit after normalization. */
export function hasSearchableChars(normalized: string): boolean {
  return /[a-z0-9]/.test(normalized);
}
