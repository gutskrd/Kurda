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
import { DailyCard } from '../daily/DailyCard';
import { EventCard } from '../events/EventCard';
import { QuestsCard } from '../quests/QuestsCard';
import { HomeLeagueLine } from '../leagues/HomeLeagueLine';
import { useT } from '../i18n/I18nProvider';
import { useArrival } from '../lib/motion';
import { lastAnswer, remember } from '../lib/apiMemory';
import { useMemoryOwner } from '../lib/useApi';
import { HeldBanner } from '../reports/HeldNotice';

const PAGE = 20;

/** The wall as it stands: posts, the server's next offset and whether there is more, keyed by the filter and order it was fetched for. */
interface Wall {
  key: string;
  items: FeedItem[];
  nextOffset: number;
  more: boolean;
}

/**
 * Lays a fresh first page over the wall already showing (from memory, or before a refresh after posting). The new page
 * leads, and what was read further down stays under it, so returning to a scrolled wall keeps its place. A post that was
 * on the old first page and is in neither now, with nothing new pushing it out, was taken down and goes.
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
 * Civak: everything the community posts on one wall, with a filter by kind and the order (newest, oldest, most popular,
 * most discussed, and their range) behind one button. Both live in the URL, so a wall can be linked to and old
 * /app/stories and /app/poems addresses redirect here; the plain wall's values are left out.
 */
export function Civak(): React.JSX.Element {
  const { client } = useAuth();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const section = asSection(params.get('section'));
  // A kind from the other half is dropped rather than sent, since the server would refuse it.
  const kind = kindWithin(section, params.get('kind'));
  // An order or range the address does not mean falls back to the plain wall's.
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
    // A new order or filter starts at its first post, so jump back to the top if scrolled past, at once rather than
    // gliding through the wall being replaced.
    const top = row.current?.getBoundingClientRect().top;
    if (top !== undefined && top < 0) row.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
  };

  /*
   * The wall as last drawn in this tab for this filter and order (lib/apiMemory.ts), shown at once on returning, as far
   * down as it was read, while the first page refreshes; only an unseen wall waits on a skeleton.
   */
  const who = useMemoryOwner();
  const wallKey = `feed:${section}:${kind ?? ''}:${sort}:${sortRanks(sort) ? period : ''}`;
  const wallNow = useRef(wallKey);
  wallNow.current = wallKey;
  const recall = (key: string): Wall | null => (who ? (lastAnswer<Wall>(who, key)?.data ?? null) : null);
  const [held, setWall] = useState<Wall | null>(() => recall(wallKey));
  // Just after a filter change the wall in hand is still the previous one's.
  const wall = held && held.key === wallKey ? held : null;
  const shown = useRef(wall);
  shown.current = wall;
  const items = wall?.items ?? null;
  // Only a wall that arrives rises in, once per tab; one from memory is simply there.
  const arriving = useArrival(!!items && items.length > 0, 'civak');
  const [error, setError] = useState<string | null>(null);
  const more = wall?.more ?? false;
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchingMore = useRef(false);

  const load = useCallback(
    async (offset: number): Promise<void> => {
      const query = new URLSearchParams({ section, limit: String(PAGE), offset: String(offset) });
      if (kind) query.set('kind', kind);
      // The plain wall's order is left out, so its address is unchanged.
      if (sort !== DEFAULT_FEED_SORT) query.set('sort', sort);
      if (sortRanks(sort) && period !== DEFAULT_FEED_PERIOD) query.set('period', period);
      const res = await client.get<{ items: FeedItem[] }>(`/feed?${query}`);
      // The filter or order changed while this was in flight, so it belongs to another wall.
      if (wallNow.current !== wallKey) return;
      if (!res.ok) {
        // A wall already on screen stays when the server cannot be reached; an empty one says why.
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
        // A ranked wall can shift between pages (a post liked meanwhile moves up), so a post already shown is skipped.
        const before = showing?.items ?? [];
        const seen = new Set(before.map((i) => i.key));
        // The server's next offset, which is not always the number of cards shown.
        return { key: wallKey, items: [...before, ...batch.filter((i) => !seen.has(i.key))], nextOffset: offset + batch.length, more: batch.length === PAGE };
      });
    },
    // `t` only words failures, and a language change mid-visit is no reason to refetch.
    [client, section, kind, sort, period, wallKey],
  );

  // Asked once per wall: on opening, and when the filter or order changes (`load` is that wall's).
  const recallNow = useRef(recall);
  recallNow.current = recall;
  useEffect(() => {
    setError(null);
    setWall(recallNow.current(wallKey));
    void load(0);
  }, [load, wallKey]);

  // What is on the wall now is what returning shows (never a wall that only failed to load).
  useEffect(() => {
    if (who && wall && !error) remember(who, wall.key, wall);
  }, [who, wall, error]);

  /* The next page loads as the wall's end nears; the button under it stays for keyboards, screen readers and old browsers. */
  const nextOffset = wall?.nextOffset ?? 0;
  const loadMore = useCallback(async (): Promise<void> => {
    // One page at a time: the end can be seen and the button pressed while one is in flight.
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
      // A screen and a half early, so posts are usually there before the reader is.
      { rootMargin: '0px 0px 150% 0px' },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [more, loadMore]);

  /** Replaces one card in place, so a like does not reload the wall. */
  const replace = useCallback((next: FeedItem) => {
    setWall((prev) => (prev ? { ...prev, items: prev.items.map((i) => (i.key === next.key ? next : i)) } : prev));
  }, []);

  /** Removes a post its author just deleted. */
  const drop = useCallback((gone: FeedItem) => {
    setWall((prev) => (prev ? { ...prev, items: prev.items.filter((i) => i.key !== gone.key) } : prev));
  }, []);

  return (
    <div className="container container-feed">
      <div className="page-header">
        <h1 className="page-title">{t('civak.title')}</h1>
        <p className="page-sub">{t('civak.subtitle')}</p>
      </div>

      {/* Where a held account lands: what waits and that learning does not. */}
      <HeldBanner />

      {/* An event while one runs; nothing otherwise. */}
      <EventCard />

      {/* The streak and today's Zêr, opening the daily view, then today's quests; nothing for a visitor. */}
      <DailyCard />
      <QuestsCard />

      {/* The week's league in one line with the goal ring, linking to it. */}
      <HomeLeagueLine />

      {/* How the wall is sorted and narrowed, then the funnel and the +, which belongs with the wall it adds to. */}
      <div className="feed-filters" ref={row}>
        <FeedFilter value={value} onChange={choose} />
        <PostButton onPosted={() => void load(0)} />
      </div>

      {error && <ErrorState message={error} onRetry={() => void load(0)} />}

      {items === null ? (
        <FeedSkeleton label="civak.loading" />
      ) : items.length === 0 ? (
        // An empty wall still has a next step: people whose posts would fill it, or the whole wall when only a kind or
        // range is empty.
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
          {/* The first screenful rises in once as the wall arrives (styles/motion.css). */}
          <div className={arriving ? 'feed rise-in' : 'feed'}>
            {items.map((item) => (
              <FeedCard key={item.key} item={item} onChanged={replace} onRemoved={drop} />
            ))}
          </div>
          {more && (
            <>
              {/* Watched for the wall's end coming near. */}
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
