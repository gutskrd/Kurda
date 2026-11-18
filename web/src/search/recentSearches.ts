import { pushRecent } from '../dictionary/recents';

/**
 * What was searched for on this visit, newest first. Kept only for the tab's lifetime, since a lasting history on a
 * shared device would reveal who somebody looked for.
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
    // Storage is blocked; the search still works but is not remembered.
  }
  return next;
}

export function clearRecentSearches(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
