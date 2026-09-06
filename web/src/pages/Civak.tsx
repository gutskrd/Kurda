import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FeedItem } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { FeedCard } from '../feed/FeedCard';
import { PostPicture } from '../images/PostPicture';

const PAGE = 20;

const FILTERS = [
  { key: 'all', label: 'Everything' },
  { key: 'stories', label: 'Çîrok' },
  { key: 'poems', label: 'Helbest' },
  { key: 'images', label: 'Dîmen' },
] as const;

type Kind = (typeof FILTERS)[number]['key'];

function asKind(value: string | null): Kind {
  return FILTERS.some((f) => f.key === value) ? (value as Kind) : 'all';
}

/**
 * Civak — everything the community has written and posted, on one wall.
 *
 * Stories, poems and pictures were three pages that were the same page three
 * times, and a poem posted this morning was invisible to anyone browsing
 * pictures. One wall, one card, and a filter for when you do want just one kind.
 *
 * The filter lives in the URL so a filtered wall can be linked to, and so the
 * old /app/stories and /app/poems addresses can simply redirect here.
 */
export function Civak(): React.JSX.Element {
  const { client } = useAuth();
  const [params, setParams] = useSearchParams();
  const kind = asKind(params.get('kind'));

  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (offset: number): Promise<void> => {
      const res = await client.get<{ items: FeedItem[] }>(`/feed?kind=${kind}&limit=${PAGE}&offset=${offset}`);
      if (!res.ok) {
        setError(describeError(res.error));
        setItems([]);
        return;
      }
      setError(null);
      const batch = res.data.items ?? [];
      setItems((prev) => (offset === 0 ? batch : [...(prev ?? []), ...batch]));
      setMore(batch.length === PAGE);
    },
    [client, kind],
  );

  useEffect(() => {
    setItems(null);
    void load(0);
  }, [load]);

  /** Replace one card in place, so a like does not reload the wall. */
  const replace = useCallback((next: FeedItem) => {
    setItems((prev) => (prev ?? []).map((i) => (i.key === next.key ? next : i)));
  }, []);

  return (
    <div className="container container-feed">
      <div className="page-header">
        <span className="eyebrow">Civak · Community</span>
        <h1 className="page-title">Civak</h1>
        <p className="page-sub">Stories, poems and pictures from everyone.</p>
        <PostPicture onPosted={() => void load(0)} />
      </div>

      <div className="seg feed-filters" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`seg-btn${kind === f.key ? ' is-active' : ''}`}
            aria-pressed={kind === f.key}
            onClick={() => setParams(f.key === 'all' ? {} : { kind: f.key }, { replace: true })}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={() => void load(0)} />}

      {items === null ? (
        <Loading label="Loading the wall…" />
      ) : items.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <>
          <div className="feed">
            {items.map((item) => (
              <FeedCard key={item.key} item={item} onChanged={replace} />
            ))}
          </div>
          {more && (
            <button type="button" className="mkp-more" onClick={() => void load(items.length)}>
              Show more
            </button>
          )}
        </>
      )}
    </div>
  );
}
