/** The recent-searches list. Pure. */

export const MAX_RECENTS = 10;

/** Add a term to the front of the recents: trimmed, de-duplicated case-insensitively, capped. Blank terms are ignored. */
export function pushRecent(list: string[], term: string, max = MAX_RECENTS): string[] {
  const trimmed = term.trim();
  if (trimmed.length === 0) return list;
  const withoutDup = list.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
  return [trimmed, ...withoutDup].slice(0, max);
}
