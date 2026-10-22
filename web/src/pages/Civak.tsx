import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FeedItem } from '../lib/types';
import { EmptyState, ErrorState } from '../components/states';
import { Button, LinkButton } from '../components/Button';
import { FeedSkeleton } from '../components/skeletons';
import { FeedCard } from '../feed/FeedCard';
import { FeedFilter, type FeedFilterValue } from '../feed/FeedFilter';
import { PostButton } from '../feed/PostButton';
import { asSection, kindWithin } from '../feed/postKinds';
import { DailyReward } from '../components/DailyReward';
import { HomeLeagueLine } from '../leagues/HomeLeagueLine';
import { useT } from '../i18n/I18nProvider';
import { useArrival } from '../lib/motion';

const PAGE = 20;

/**
 * Civak — everything the community has written and posted, on one wall.
 *
 * Stories, poems and pictures were three pages that were the same page three
 * times, and a poem posted this morning was invisible to anyone browsing
 * pictures. One wall, one card, and a filter for when you do want just one kind
 * — behind a button, so the wall opens on the posts rather than on a choice.
 *
 * The filter lives in the URL so a filtered wall can be linked to, and so the
 * old /app/stories and /app/poems addresses can simply redirect here.
 */
export function Civak(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const section = asSection(params.get('section'));
  // a kind belongs to a half; one left over from the other half is dropped
  // rather than asked for, which the server would refuse
  const kind = kindWithin(section, params.get('kind'));

  const choose = (to: FeedFilterValue): void => {
    const next: Record<string, string> = {};
    if (to.section !== 'all') next.section = to.section;
    if (to.kind) next.kind = to.kind;
    setParams(next, { replace: true });
  };

  const [items, setItems] = useState<FeedItem[] | null>(null);
  const arriving = useArrival(!!items && items.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(
    async (offset: number): Promise<void> => {
      const query = new URLSearchParams({ section, limit: String(PAGE), offset: String(offset) });
      if (kind) query.set('kind', kind);
      const res = await client.get<{ items: FeedItem[] }>(`/feed?${query}`);
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
    [client, section, kind],
  );

  useEffect(() => {
    setItems(null);
    void load(0);
  }, [load]);

  /** Replace one card in place, so a like does not reload the wall. */
  const replace = useCallback((next: FeedItem) => {
    setItems((prev) => (prev ?? []).map((i) => (i.key === next.key ? next : i)));
  }, []);

  /** A post its author just deleted is gone; leaving the card would be a lie. */
  const drop = useCallback((gone: FeedItem) => {
    setItems((prev) => (prev ?? []).filter((i) => i.key !== gone.key));
  }, []);

  return (
    <div className="container container-feed">
      <div className="page-header">
        <h1 className="page-title">{t('civak.title')}</h1>
        <p className="page-sub">{t('civak.subtitle')}</p>
      </div>

      {/*
        The claim used to sit on a separate page of tiles that was the first
        thing you saw. That page is gone — this wall is home now — so the one
        thing on it that was not a door comes with it. It renders nothing at all
        for a visitor without an account, and nothing once today is claimed.
      */}
      <DailyReward />

      {/* the week's league in one line, with the goal ring: a door to it, not a copy */}
      <HomeLeagueLine />

      {/* what the wall is narrowed to, then the filter and the + — the + belongs with the wall it adds to */}
      <div className="feed-filters">
        <FeedFilter value={{ section, kind }} onChange={choose} />
        <PostButton onPosted={() => void load(0)} />
      </div>

      {error && <ErrorState message={error} onRetry={() => void load(0)} />}

      {items === null ? (
        <FeedSkeleton label="civak.loading" />
      ) : items.length === 0 ? (
        // an empty wall still has a next step: the people whose posts would fill it,
        // or, when it is only empty of one kind, everything else on it
        <EmptyState
          title={t('civak.empty')}
          message={section === 'all' ? t('civak.emptyBody') : undefined}
          action={
            section === 'all' ? (
              <LinkButton to="/app/search" size="sm" className="state-action">
                {t('rail.findPeople')}
              </LinkButton>
            ) : (
              <Button type="button" variant="secondary" size="sm" className="state-action" onClick={() => choose({ section: 'all', kind: null })}>
                {t('civak.filter.clear')}
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* the first screenful rises in once, as the wall arrives (styles/motion.css) */}
          <div className={arriving ? 'feed rise-in' : 'feed'}>
            {items.map((item) => (
              <FeedCard key={item.key} item={item} onChanged={replace} onRemoved={drop} />
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
