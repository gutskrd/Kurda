import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import { useT } from '../i18n/I18nProvider';
import type { UserSummary } from '../lib/types';
import type { SearchHit, SearchResult } from '../dictionary/types';

/** The people search takes at most thirty characters; the server refuses more. */
const PEOPLE_MAX = 30;
/** How many of each kind the bar shows; the rest are on the Search page. */
const QUICK_PER_KIND = 5;
/** Queries remembered for this visit, so deleting a letter does not ask again. */
const CACHE_SIZE = 30;

interface QuickResults {
  /** The query these results are for, which can trail what is typed while the next arrives. */
  query: string;
  people: UserSummary[];
  words: SearchHit[];
  /** Nothing matched a word exactly and these are the closest ones. */
  fuzzy: boolean;
}

interface QuickSearch {
  /** The newest finished results, kept on screen while the next ones load. */
  results: QuickResults | null;
  /** A request for the current query is out. */
  loading: boolean;
  /** Why the current query could not be searched, in words. */
  error: string | null;
}

/**
 * People and words for the bar's search, from `GET /users/search` and `GET /dictionary/search` side by side. The
 * query arrives debounced, since the people search is rate-limited, and each finished query is cached for the visit.
 * The last results stay on screen while the next load. An empty query asks nothing; the caller passes one for
 * visitors, since both searches need an account.
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
      // One search failing still shows the other's results; both failing is an error.
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
        // Evict the oldest once full.
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
