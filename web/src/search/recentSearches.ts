import { pushRecent } from '../dictionary/recents';

/**
 * What was searched for on this visit, newest first.
 *
 * Kept for the tab's lifetime and no longer, like the dictionary's recents: a
 * search history that outlives the visit is a record of who somebody looked
 * for and which words they did not know, on a device that may be shared with
 * a family, and nobody asked us to keep one.
 */
const KEY = 'hevalo_recent_searches';
const MAX = 8;

export function readRecentSearches(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(term: string): string[] {
  const next = pushRecent(readRecentSearches(), term, MAX);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked: the search still works, it is only not remembered
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
