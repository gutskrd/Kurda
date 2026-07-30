/** Recent-search list management (KUR-045). Pure, unit-tested. */

export const MAX_RECENTS = 10;

/**
 * Add a term to the front of the recents list: trimmed, de-duplicated
 * (case-insensitively), most-recent-first, capped. Blank terms are ignored.
 */
export function pushRecent(list: string[], term: string, max = MAX_RECENTS): string[] {
  const trimmed = term.trim();
  if (trimmed.length === 0) return list;
  const withoutDup = list.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
  return [trimmed, ...withoutDup].slice(0, max);
}
