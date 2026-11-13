import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_FEED_PERIOD, DEFAULT_FEED_SORT, isFeedPeriod, isFeedSort, sortRanks } from '@kurda/shared';
import { useAuth } from '../auth/AuthProvider';
import { describeError } from '../lib/api';
import type { FeedItem } from '../lib/types';
import { EmptyState, ErrorState } from '../components/states';
import { Button, LinkButton } from '../components/Button';
import { FeedSkeleton } from '../components/skeletons';
import { FeedCard } from '../feed/FeedCard';
import { DEFAULT_FILTER, FeedFilter, isDefaultFilter, type FeedFilterValue } from '../feed/FeedFilter';
import { PostButton } from '../feed/PostButton';
import { asSection, kindWithin } from '../feed/postKinds';
import { DailyReward } from '../components/DailyReward';
import { HomeLeagueLine } from '../leagues/HomeLeagueLine';
import { useT } from '../i18n/I18nProvider';
import { useArrival } from '../lib/motion';
import { lastAnswer, remember } from '../lib/apiMemory';
import { useMemoryOwner } from '../lib/useApi';

const PAGE = 20;

/**
 * The wall as it stands: its posts, where the next page starts on the server,
 * and whether there is one. It carries the filter and order it was fetched
 * for (`key`), so a wall is never shown, or remembered, under another's.
 */
interface Wall {
  key: string;
  items: FeedItem[];
  nextOffset: number;
  more: boolean;
}

/**
 * A first page that has just arrived, laid over the wall that was already
 * showing (drawn from memory, or about to be refreshed after a post).
 *
 * With nothing showing it is simply the wall. Otherwise the new page leads —
 * a post made since is at the top, a count that moved is the new one — and
 * what had been read further down stays under it, so coming back to a wall
 * that was scrolled does not cut it back to its first twenty. A post that was
 * in the first page before and is in neither now, when nothing new pushed it
 * out, has been taken down, and goes.
 */
export function firstPage(showing: Wall | null, key: string, page: FeedItem[]): Wall {
  const held = showing?.items ?? [];
  if (!showing || held.length <= PAGE) return { key, items: page, nextOffset: page.length, more: page.length === PAGE };
  const fresh = new Set(page.map((i) => i.key));
  const before = new Set(held.map((i) => i.key));
  const nothingNew = page.every((i) => before.has(i.key));
  const rest = held.filter((i, at) => !fresh.has(i.key) && !(nothingNew && at < PAGE));
  return { key, items: [...page, ...rest], nextOffset: Math.max(showing.nextOffset, page.length), more: showing.more };
}

/**
 * Civak — everything the community has written and posted, on one wall.
 *
 * Stories, poems and pictures were three pages that were the same page three
 * times, and a poem posted this morning was invisible to anyone browsing
 * pictures. One wall, one card, and a filter for when you do want just one kind
 * — behind a button, so the wall opens on the posts rather than on a choice.
 *
 * The order (newest, oldest, most popular, most discussed, and how far back
 * the ranked two look) sits behind the same button.
 *
 * The filter and the order live in the URL so a wall can be linked to as it
 * is shown, and so the old /app/stories and /app/poems addresses can simply
 * redirect here. Whatever is the plain wall's is left out of it.
 */
export function Civak(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const section = asSection(params.get('section'));
  // a kind belongs to a half; one left over from the other half is dropped
  // rather than asked for, which the server would refuse
  const kind = kindWithin(section, params.get('kind'));
  // an order or a range the address does not mean falls back to the plain wall's
  const rawSort = params.get('sort');
  const sort = isFeedSort(rawSort) ? rawSort : DEFAULT_FEED_SORT;
  const rawPeriod = params.get('period');
  const period = sortRanks(sort) && isFeedPeriod(rawPeriod) ? rawPeriod : DEFAULT_FEED_PERIOD;
  const value: FeedFilterValue = { section, kind, sort, period };
  const row = useRef<HTMLDivElement>(null);

  const choose = (to: FeedFilterValue): void => {
    const next: Record<string, string> = {};
    if (to.section !== 'all') next.section = to.section;
    if (to.kind) next.kind = to.kind;
    if (to.sort !== DEFAULT_FEED_SORT) next.sort = to.sort;
    if (sortRanks(to.sort) && to.period !== DEFAULT_FEED_PERIOD) next.period = to.period;
    setParams(next, { replace: true });
    // a new order or filter starts from its first post: back up to the top of the wall if it has been scrolled
    // past — at once, as a new page starts at its top, not gliding up through the wall that is being replaced
    const top = row.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) row.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  };

  /*
   * The wall as it was last drawn in this tab, for this filter and order
   * (lib/apiMemory.ts): coming back to it — from a post, from Learn — shows
   * it at once, as far down as it had been read, and the first page is asked
   * for again behind it. Only a wall never seen before waits on a skeleton.
   */
  const who = useMemoryOwner();
  const wallKey = `feed:${section}:${kind ?? ''}:${sort}:${sortRanks(sort) ? period : ''}`;
  const wallNow = useRef(wallKey);
  wallNow.current = wallKey;
  const recall = (key: string): Wall | null => (who ? (lastAnswer<Wall>(who, key)?.data ?? null) : null);
  const [held, setWall] = useState<Wall | null>(() => recall(wallKey));
  // the filter was changed a moment ago and the wall in hand is still the last one's: that is not this wall
  const wall = held && held.key === wallKey ? held : null;
  const shown = useRef(wall);
  shown.current = wall;
  const items = wall?.items ?? null;
  // only a wall that arrives rises in, and only the first time in this tab: one drawn from memory is simply there
  const arriving = useArrival(!!items && items.length > 0, 'civak');
  const [error, setError] = useState<string | null>(null);
  const more = wall?.more ?? false;
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchingMore = useRef(false);

  const load = useCallback(
    async (offset: number): Promise<void> => {
      const query = new URLSearchParams({ section, limit: String(PAGE), offset: String(offset) });
      if (kind) query.set('kind', kind);
      // the plain wall's order is left out, so its address is the one it always was
      if (sort !== DEFAULT_FEED_SORT) query.set('sort', sort);
      if (sortRanks(sort) && period !== DEFAULT_FEED_PERIOD) query.set('period', period);
      const res = await client.get<{ items: FeedItem[] }>(`/feed?${query}`);
      // the filter or the order was changed while this was on its way: it is another wall's answer now
      if (wallNow.current !== wallKey) return;
      if (!res.ok) {
        // a wall already on the screen stays there when the server cannot be reached; an empty one says why
        if (shown.current && shown.current.items.length > 0) return;
        setError(describeError(res.error, t));
        setWall({ key: wallKey, items: [], nextOffset: 0, more: false });
        return;
      }
      setError(null);
      const batch = res.data.items ?? [];
      setWall((prev) => {
        const showing = prev && prev.key === wallKey ? prev : null;
        if (offset === 0) return firstPage(showing, wallKey, batch);
        // a ranked wall can shift between two pages — a post liked meanwhile moves up — so a post
        // already shown is not shown twice
        const before = showing?.items ?? [];
        const seen = new Set(before.map((i) => i.key));
        // where the next page starts on the server, which is not always how many cards are shown
        return { key: wallKey, items: [...before, ...batch.filter((i) => !seen.has(i.key))], nextOffset: offset + batch.length, more: batch.length === PAGE };
      });
    },
    // (`t` only words a failure, and a language changed mid-visit is no reason to ask for the wall again)
    [client, section, kind, sort, period, wallKey],
  );

  // asked once for each wall: when the page opens, and when its filter or order changes (`load` is that wall's)
  const recallNow = useRef(recall);
  recallNow.current = recall;
  useEffect(() => {
    setError(null);
    setWall(recallNow.current(wallKey));
    void load(0);
  }, [load, wallKey]);

  // what is on the wall now is what coming back to it shows (never a wall that only failed to load)
  useEffect(() => {
    if (who && wall && !error) remember(who, wall.key, wall);
  }, [who, wall, error]);

  /*
   * The next page arrives as the end of the wall comes near, so reading on
   * needs no press; the button under the wall stays, for a keyboard, a screen
   * reader and a browser that cannot watch for it.
   */
  const nextOffset = wall?.nextOffset ?? 0;
  const loadMore = useCallback(async (): Promise<void> => {
    // one page at a time: the end of the wall can be seen, and the button pressed, while a page is on its way
    if (fetchingMore.current) return;
    fetchingMore.current = true;
    setLoadingMore(true);
    await load(nextOffset);
    fetchingMore.current = false;
    setLoadingMore(false);
  }, [load, nextOffset]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = end.current;
    if (!el || !more || typeof IntersectionObserver !== 'function') return;
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      // a screen and a half early, so the posts are usually there before the reader is
      { rootMargin: '0px 0px 150% 0px' },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [more, loadMore]);

  /** Replace one card in place, so a like does not reload the wall. */
  const replace = useCallback((next: FeedItem) => {
    setWall((prev) => (prev ? { ...prev, items: prev.items.map((i) => (i.key === next.key ? next : i)) } : prev));
  }, []);

  /** A post its author just deleted is gone; leaving the card would be a lie. */
  const drop = useCallback((gone: FeedItem) => {
    setWall((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.key !== gone.key) } : prev));
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

      {/* how the wall is sorted and narrowed, then the funnel and the + — the + belongs with the wall it adds to */}
      <div className="feed-filters" ref={row}>
        <FeedFilter value={value} onChange={choose} />
        <PostButton onPosted={() => void load(0)} />
      </div>

      {error && <ErrorState message={error} onRetry={() => void load(0)} />}

      {items === null ? (
        <FeedSkeleton label="civak.loading" />
      ) : items.length === 0 ? (
        // an empty wall still has a next step: the people whose posts would fill it,
        // or, when it is only empty of one kind or one range, the whole wall again
        <EmptyState
          title={t('civak.empty')}
          message={isDefaultFilter(value) ? t('civak.emptyBody') : undefined}
          action={
            isDefaultFilter(value) ? (
              <LinkButton to="/app/search" size="sm" className="state-action">
                {t('rail.findPeople')}
              </LinkButton>
            ) : (
              <Button type="button" variant="secondary" size="sm" className="state-action" onClick={() => choose(DEFAULT_FILTER)}>
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
            <>
              {/* what the page watches for: the end of the wall coming near */}
              <div ref={end} aria-hidden="true" />
              <button type="button" className="mkp-more" onClick={() => void loadMore()} aria-busy={loadingMore || undefined}>
                {t('common.showMore')}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
