import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { FeedCard } from './FeedCard';
import type { FeedItem } from '../lib/types';
import { ArrowIcon } from '../components/icons';

/** Enough to show the wall is alive, few enough that home stays a home page. */
const SHOW = 3;

/**
 * The community, on the way in.
 *
 * Home was a page of doors — six tiles, one of which said "Civak: stories,
 * poems and pictures from everyone". A door tells you a room exists; it does
 * not tell you anything happened in it today. The whole point of a community is
 * that there is something new in it, and that is exactly what a link cannot
 * say.
 *
 * The real cards, not a summary of them: the same component the wall uses, so
 * a post can be liked or opened from here and behaves identically. Three of
 * them, because home should still be somewhere you pass through.
 *
 * Renders nothing at all when the wall is empty or unreachable. A home page
 * that says "couldn't load the community" is worse than one that quietly does
 * not mention it — nothing here is the point of the page.
 */
export function CivakPreview(): React.JSX.Element | null {
  const { client } = useAuth();
  const [items, setItems] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await client.get<{ items: FeedItem[] }>(`/feed?section=all&limit=${SHOW}&offset=0`);
      if (cancelled) return;
      setItems(res.ok ? (res.data.items ?? []) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

  /** A like here should not reload the wall, exactly as on the wall itself. */
  const replace = useCallback((next: FeedItem) => {
    setItems((prev) => (prev ?? []).map((i) => (i.key === next.key ? next : i)));
  }, []);

  const drop = useCallback((gone: FeedItem) => {
    setItems((prev) => (prev ?? []).filter((i) => i.key !== gone.key));
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <section className="home-civak">
      <div className="home-civak-head">
        <h2 className="friend-heading" style={{ margin: 0 }}>
          From Civak
        </h2>
        <Link to="/app/civak" className="link home-civak-all">
          See the whole wall <ArrowIcon />
        </Link>
      </div>

      <div className="home-civak-list">
        {items.map((item) => (
          <FeedCard key={item.key} item={item} onChanged={replace} onRemoved={drop} />
        ))}
      </div>
    </section>
  );
}
