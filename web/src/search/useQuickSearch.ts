import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import type { UserSummary } from '../lib/types';
import type { SearchHit, SearchResult } from '../dictionary/types';

/** The people search takes at most thirty characters; the server refuses more. */
export const PEOPLE_MAX = 30;
/** How many of each kind the bar shows; the rest are one press away on the Search page. */
export const QUICK_PER_KIND = 5;
/** Queries remembered for this visit, so going back a letter does not ask again. */
const CACHE_SIZE = 30;

export interface QuickResults {
  /** the query these results are for, which can trail what is typed while the next arrives */
  query: string;
  people: UserSummary[];
  words: SearchHit[];
  /** nothing matched a word exactly and these are the closest ones */
  fuzzy: boolean;
}

export interface QuickSearch {
  /** the newest finished results, kept on screen while the next ones load */
  results: QuickResults | null;
  /** a request for the current query is out */
  loading: boolean;
  /** why the current query could not be searched, in words */
  error: string | null;
}

/**
 * People and words for the bar's search, from the two searches the API has
 * (GET /users/search and GET /dictionary/search), asked side by side.
 *
 * The query arrives already debounced, so one request pair goes out per pause
 * in typing rather than one per letter — the people search is rate-limited,
 * and a fast typist would otherwise spend the minute's allowance on one name.
 * Each finished query is kept for the visit, so deleting a letter shows the
 * answer it already had instead of asking again.
 *
 * The last results stay on screen while the next load, rather than the list
 * emptying to a spinner on every pause: a list that blinks is harder to read
 * than one that updates.
 *
 * An empty query asks nothing. Both searches need an account, so the caller
 * passes an empty query for a visitor.
 */
export function useQuickSearch(query: string): QuickSearch {
  const { client } = useAuth();
  const t = useT();
  const cache = useRef(new Map<string, QuickResults>());
  const [results, setResults] = useState<QuickResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    if (!query) {
      setLoading(false);
      setResults(null);
      return;
    }
    const known = cache.current.get(query);
    if (known) {
      setLoading(false);
      setResults(known);
      return;
    }

    let live = true;
    setLoading(true);
    const q = encodeURIComponent(query);
    const people = client.get<{ results: UserSummary[] }>(`/users/search?q=${encodeURIComponent(query.slice(0, PEOPLE_MAX))}`);
    const words = client.get<SearchResult>(`/dictionary/search?q=${q}&limit=${QUICK_PER_KIND}`);
    void Promise.all([people, words]).then(([p, w]) => {
      if (!live) return;
      setLoading(false);
      // one half failing still shows the other half; both failing is an error
      if (!p.ok && !w.ok) {
        setError(describeError(p.error, t));
        return;
      }
      const found: QuickResults = {
        query,
        people: p.ok ? (p.data.results ?? []).slice(0, QUICK_PER_KIND) : [],
        words: w.ok ? (w.data.results ?? []).slice(0, QUICK_PER_KIND) : [],
        fuzzy: w.ok ? Boolean(w.data.fuzzy) : false,
      };
      if (p.ok && w.ok) {
        cache.current.set(query, found);
        // the oldest goes first once there are enough
        if (cache.current.size > CACHE_SIZE) cache.current.delete(cache.current.keys().next().value!);
      }
      setResults(found);
    });
    return () => {
      live = false;
    };
  }, [client, query, t]);

  return { results, loading, error };
}
