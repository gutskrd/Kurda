import { useCallback, useEffect, useState } from 'react';
import type { StoryDialect, StoryListItem } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import type { ApiClient } from '../lib/api';
import { API_URL } from '../lib/config';
import { describeError } from '../lib/api';
import type { ApiError } from '../lib/types';
import { useT } from '../i18n/I18nProvider';

/**
 * How long a list of stories is kept in the tab. The server caches the list
 * for five minutes too, and a story is added or taken down by a reviewer, not
 * every minute; going from the hub to a story and back should not ask again.
 */
const KEEP_MS = 5 * 60 * 1000;

type Listed = { stories: StoryListItem[] } | { error: ApiError };

const lists = new Map<string, { at: number; stories: Promise<Listed> }>();

function listKey(dialect: StoryDialect | null): string {
  return dialect ?? 'all';
}

/** `GET /stories` (one variety, or every published story), kept for a few minutes. */
function fetchList(client: ApiClient, dialect: StoryDialect | null, fresh = false): Promise<Listed> {
  const key = listKey(dialect);
  const kept = lists.get(key);
  if (!fresh && kept && Date.now() - kept.at < KEEP_MS) return kept.stories;
  const stories = client
    .get<{ stories: StoryListItem[] }>(dialect ? `/stories?dialect=${dialect}` : '/stories')
    .then((r): Listed => (r.ok ? { stories: Array.isArray(r.data.stories) ? r.data.stories : [] } : { error: r.error }));
  lists.set(key, { at: Date.now(), stories });
  // a failure is not kept: the next look asks again
  void stories.then((s) => {
    if ('error' in s && lists.get(key)?.stories === stories) lists.delete(key);
  });
  return stories;
}

/** For tests: forget every list. */
export function clearStoryLists(): void {
  lists.clear();
}

/** The published stories of one variety, easiest and shortest first (the server's order). */
export function useStoryList(dialect: StoryDialect): {
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
    let live = true;
    setState({ stories: null, error: null });
    void fetchList(client, dialect, fresh > 0).then((s) => {
      if (!live) return;
      setState('stories' in s ? { stories: s.stories, error: null } : { stories: null, error: describeError(s.error, t) });
    });
    return () => {
      live = false;
    };
  }, [client, dialect, fresh, t]);

  return { ...state, reload };
}

/** How many published stories another variety has, for "switch to …" on an empty one; null while unknown. */
export function useStoryCount(dialect: StoryDialect, enabled: boolean): number | null {
  const { client } = useAuth();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void fetchList(client, dialect).then((s) => {
      if (live) setCount('stories' in s ? s.stories.length : null);
    });
    return () => {
      live = false;
    };
  }, [client, dialect, enabled]);
  return count;
}

export type Availability = 'unknown' | 'yes' | 'none';

let available: Promise<Availability> | null = null;

/**
 * Whether any story is published at all — the Stories card says "Coming
 * soon" when none is (contract §A1). Unknown until asked, and "unknown" is
 * shown as the normal card: a card should not flash "Coming soon" at
 * somebody while the answer is on its way, or when it never arrives.
 *
 * A plain request rather than the signed-in client: the list is public, and
 * the front page that asks has no account to send. `enabled` lets it ask
 * only once the card is near the screen. Asked once per tab.
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
        // an answer that did not come is asked for again next time
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

/** For tests: forget the answer. */
export function resetStoriesAvailable(): void {
  available = null;
}
