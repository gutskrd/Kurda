import { useCallback, useEffect, useState } from 'react';
import type { StoryCategory, StoryDialect, StoryListItem } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { ApiClient } from '../lib/api';
import { API_URL } from '../lib/config';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { useT } from '../i18n/I18nProvider';

/** How long a story list is kept in the tab; the server caches it for five minutes too, and stories change rarely. */
const KEEP_MS = 5 * 60 * 1000;

type Listed = { stories: StoryListItem[] } | { error: ApiError };

const lists = new Map<string, { at: number; stories: Promise<Listed> }>();

function listKey(dialect: StoryDialect | null): string {
  return dialect ?? 'all';
}

/** `GET /stories` (one variety, or all), kept a few minutes; one page of fifty is enough to know which lengths exist. */
function fetchList(client: ApiClient, dialect: StoryDialect | null, fresh = false): Promise<Listed> {
  const key = listKey(dialect);
  const kept = lists.get(key);
  if (!fresh && kept && Date.now() - kept.at < KEEP_MS) return kept.stories;
  const stories = client
    .get<{ stories: StoryListItem[] }>(dialect ? `/stories?dialect=${dialect}&limit=50` : '/stories?limit=50')
    .then((r): Listed => (r.ok ? { stories: Array.isArray(r.data.stories) ? r.data.stories : [] } : { error: r.error }));
  lists.set(key, { at: Date.now(), stories });
  // A failure is not kept, so the next look asks again.
  void stories.then((s) => {
    if ('error' in s && lists.get(key)?.stories === stories) lists.delete(key);
  });
  return stories;
}

/** Forgets every list, for tests. */
export function clearStoryLists(): void {
  lists.clear();
}

/** The published stories of one variety in the server's order (easiest, shortest first); `enabled` false asks nothing. */
export function useStoryList(dialect: StoryDialect, enabled = true): {
  stories: StoryListItem[] | null;
  error: string | null;
  reload: () => void;
} {
  const { client } = useAuth();
  const t = useT();
  const [state, setState] = useState<{ stories: StoryListItem[] | null; error: string | null }>({ stories: null, error: null });
  const [fresh, setFresh] = useState(0);
  const reload = useCallback(() => setFresh((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState({ stories: null, error: null });
    void fetchList(client, dialect, fresh > 0).then((s) => {
      if (!live) return;
      setState('stories' in s ? { stories: s.stories, error: null } : { stories: null, error: describeError(s.error, t) });
    });
    return () => {
      live = false;
    };
  }, [client, dialect, fresh, t, enabled]);

  return { ...state, reload };
}

export type Availability = 'unknown' | 'yes' | 'none';

let available: Promise<Availability> | null = null;

/**
 * Whether any story is published, so the Stories card can say "Coming soon"; "unknown" shows the normal card. A plain
 * public request, since the front page has no account; `enabled` waits until the card is near the screen. Once per tab.
 */
export function useStoriesAvailable(enabled = true): Availability {
  const [answer, setAnswer] = useState<Availability>('unknown');
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    available ??= fetch(`${API_URL}/stories`)
      .then(async (res) => {
        if (!res.ok) return 'unknown' as const;
        const body = (await res.json()) as { stories?: unknown };
        if (!Array.isArray(body.stories)) return 'unknown' as const;
        return body.stories.length > 0 ? ('yes' as const) : ('none' as const);
      })
      .catch(() => 'unknown' as const)
      .then((a) => {
        // An answer that did not come is asked again next time.
        if (a === 'unknown') available = null;
        return a;
      });
    void available.then((a) => {
      if (live) setAnswer(a);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return answer;
}

/** Forgets the answer, for tests. */
export function resetStoriesAvailable(): void {
  available = null;
}

let categories: Promise<StoryCategory[] | null> | null = null;

/**
 * The story categories (`GET /stories/categories`), fetched once per tab. Null while loading or after a failure, when a
 * page omits the category rather than show its slug.
 */
export function useStoryCategories(): StoryCategory[] | null {
  const { client } = useAuth();
  const [list, setList] = useState<StoryCategory[] | null>(null);
  useEffect(() => {
    let live = true;
    categories ??= client.get<{ categories: StoryCategory[] }>('/stories/categories').then((r) => {
      if (r.ok && Array.isArray(r.data.categories)) return r.data.categories;
      // An answer that did not come is asked again next time.
      categories = null;
      return null;
    });
    void categories.then((c) => {
      if (live) setList(c);
    });
    return () => {
      live = false;
    };
  }, [client]);
  return list;
}

/** Forgets the categories, for tests. */
export function clearStoryCategories(): void {
  categories = null;
}
