import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FeedItem } from '../lib/types';
import { ErrorState } from '../components/states';
import { FeedSkeleton } from '../components/skeletons';
import { FeedCard } from '../feed/FeedCard';
import { useT } from '../i18n/I18nProvider';
import { BookmarkIcon } from '../components/icons';
import { useArrival } from '../lib/motion';

const PAGE = 20;

/** Everything you saved, newest saves first, on the wall's own card so each post looks as it did where you found it. */
export function Saved(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  // Once per tab: a list opened again does not rise in again (lib/motion.ts).
  const arriving = useArrival(!!items && items.length > 0, 'saved');
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (offset: number): Promise<void> => {
      const res = await client.get<{ items: FeedItem[] }>(`/me/saved?limit=${PAGE}&offset=${offset}`);
      if (!res.ok) {
        setError(describeError(res.error, t));
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

  /** Unsaving here removes the post from the list, since this list is the saves; elsewhere the card stays. */
  const changed = useCallback((next: FeedItem) => {
    setItems((prev) =>
      (prev ?? []).flatMap((i) => (i.key !== next.key ? [i] : next.engagement.bookmarked ? [next] : [])),
    );
  }, []);

  return (
    <div className="container container-feed">
      <div className="page-header">
        <span className="eyebrow">{t('nav.profile')}</span>
        <h1 className="page-title">{t('saved.title')}</h1>
        <p className="page-sub">{t('saved.subtitle')}</p>
      </div>

      {error && <ErrorState message={error} onRetry={() => void load(0)} />}

      {items === null ? (
        <FeedSkeleton count={3} label="saved.loading" />
      ) : items.length === 0 ? (
        <div className="saved-empty">
          <BookmarkIcon size={30} />
          <p className="muted">
            {t('saved.emptyLead')}{' '}
            <Link to="/app/civak" className="link">{t('saved.emptyLink')}</Link>{' '}
            {t('saved.emptyTail')}
          </p>
        </div>
      ) : (
        <>
          {/* The first screenful rises in once as the list arrives (styles/motion.css). */}
          <div className={arriving ? 'feed rise-in' : 'feed'}>
            {items.map((item) => (
              <FeedCard key={item.key} item={item} onChanged={changed} onRemoved={(gone) => changed({ ...gone, engagement: { ...gone.engagement, bookmarked: false } })} />
            ))}
          </div>
          {more && (
            <button type="button" className="mkp-more" onClick={() => void load(items.length)}>
              {t('common.showMore')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
