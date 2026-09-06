import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FeedItem } from '../lib/types';
import { Loading, ErrorState } from '../components/states';
import { FeedCard } from '../feed/FeedCard';
import { BookmarkIcon } from '../components/icons';

const PAGE = 20;

/**
 * Everything you have saved, most recently saved first.
 *
 * The same card as the wall, deliberately — a reading list that rendered posts
 * differently from where you found them would make you re-read each one to work
 * out what it was.
 */
export function Saved(): React.JSX.Element {
  const { client } = useAuth();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (offset: number): Promise<void> => {
      const res = await client.get<{ items: FeedItem[] }>(`/me/saved?limit=${PAGE}&offset=${offset}`);
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
    [client],
  );

  useEffect(() => {
    void load(0);
  }, [load]);

  /**
   * Unsaving something here takes it off the list.
   *
   * Everywhere else the card stays and the bookmark empties, which is right —
   * you are looking at the wall, not at your saves. Here the list *is* the
   * saves, so a post you just removed sitting in it would be a lie.
   */
  const changed = useCallback((next: FeedItem) => {
    setItems((prev) =>
      (prev ?? []).flatMap((i) => (i.key !== next.key ? [i] : next.engagement.bookmarked ? [next] : [])),
    );
  }, []);

  return (
    <div className="container container-feed">
      <div className="page-header">
        <span className="eyebrow">Tomarkirî · Saved</span>
        <h1 className="page-title">Saved</h1>
        <p className="page-sub">Posts you kept to come back to. Only you can see this.</p>
      </div>

      {error && <ErrorState message={error} onRetry={() => void load(0)} />}

      {items === null ? (
        <Loading label="Loading your saved posts…" />
      ) : items.length === 0 ? (
        <div className="saved-empty">
          <BookmarkIcon size={30} />
          <p className="muted">
            Nothing saved yet. Tap the bookmark on any post in{' '}
            <Link to="/app/civak" className="link">Civak</Link> to keep it here.
          </p>
        </div>
      ) : (
        <>
          <div className="feed">
            {items.map((item) => (
              <FeedCard key={item.key} item={item} onChanged={changed} />
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
