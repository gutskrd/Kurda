/** The dictionary's list of recent searches. */

const MAX_RECENTS = 10;

/** Adds a trimmed term to the front of the list, without case-insensitive duplicates, capped; blank terms are ignored. */
export function pushRecent(list: string[], term: string, max = MAX_RECENTS): string[] {
  const trimmed = term.trim();
  if (trimmed.length === 0) return list;
  const withoutDup = list.filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
  return [trimmed, ...withoutDup].slice(0, max);
}
