import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Rise } from '../theme/MotionParts';
import { useListEntrance } from '../theme/animate';
import { refreshFelt } from '../feedback/haptics';
import { useAuth } from '../auth/AuthContext';
import { useAccountGate } from '../auth/AccountGate';
import { layout, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { GradientBackground } from '../theme/glass';
import type { TabNavigation } from '../navigation/rootStack';
import { useTabBarInset } from '../navigation/tabBarLayout';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { HeaderButton } from '../navigation/HeaderButton';
import { NotificationBell } from '../notifications/NotificationBell';
import { useUnread } from '../messages/unread';
import { useDirection } from '../reports/direction';
import { getFeed } from './api';
import { FeedCard, FeedSkeleton } from './FeedCard';
import { FriendsRow } from './FriendsRow';
import type { FeedItem } from './types';
import {
  DEFAULT_FILTER,
  FeedFilterSheet,
  filterLabel,
  filterSummary,
  isDefaultFilter,
  normalise,
  sortLabel,
  type FeedFilterValue,
} from './FeedFilter';
import { onPostDeleted, samePost } from '../composer/postDeleted';
import { EmptyState } from '../theme/EmptyState';
import { FilterChip, FilterChips } from '../theme/FilterSheet';
import { Loading } from '../theme/Loading';

const PAGE = 20;

/**
 * Home — everything the community has written and posted, on one wall.
 *
 * The same wall the web app opens on, reading the same `/feed`. Before this the
 * phone had Library and Memes as two separate screens behind two links in the
 * Social tab, which meant a poem posted this morning was invisible to anyone
 * looking at pictures. One wall, one card, and a filter for when you do want
 * just one kind.
 *
 * Its header is the shape every social app's home has, so nobody has to learn
 * it: the name at the start, and at the end a "+" to post and the bell —
 * notifications live here, a tap from the screen people open first, with a
 * dot while any are unread. Under it, the row of friends' faces, then the
 * filters, then the posts, which run the full width of the screen: a picture
 * is the size of the phone, not of a card on it.
 *
 * The wall is read from its skeleton twice only: as it first opens, and when
 * the way of reading it changes. Coming back to it keeps the posts and the
 * place, and brings it up to date without a sign of doing so.
 */
export function CivakScreen(): React.JSX.Element {
  const { client } = useAuth();
  // a guest reads the wall; writing on it is the account's (auth/AccountGate)
  const { require } = useAccountGate();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const topInset = useScreenTopInset();
  const { refresh: refreshBadges } = useUnread();

  const navigation = useNavigation<TabNavigation>();
  const compose = useCallback(() => {
    if (require('post')) navigation.navigate('Compose');
  }, [require, navigation]);
  const listRef = useRef<FlatList<FeedItem>>(null);
  // tapping Home while on Home goes back to the newest post
  useScrollToTop(listRef);
  const tabBarInset = useTabBarInset();
  // in what order the wall is read, from how far back, and which posts
  const [filter, setFilter] = useState<FeedFilterValue>(DEFAULT_FILTER);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const [filtering, setFiltering] = useState(false);
  // whether the wall is at its top, and the new posts a quiet read brought while it was not (see the focus effect)
  const atTop = useRef(true);
  const waiting = useRef<FeedItem[]>([]);

  /** A new way of reading the wall: from its top, the posts asked for again. */
  const choose = useCallback((next: FeedFilterValue) => {
    setFilter(normalise(next));
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const fetchPage = useCallback(
    (offset: number) => getFeed(client, { section: filter.section, kind: filter.kind, sort: filter.sort, period: filter.period, limit: PAGE, offset }),
    [client, filter],
  );

  // the bell's dot is worth getting right on the screen it sits on
  useFocusEffect(
    useCallback(() => {
      refreshBadges({ soon: true });
    }, [refreshBadges]),
  );

  /*
   * The wall as it first arrives, and from its skeleton again when the way
   * of reading it changes (another order, another kind of post): those are
   * the two times nothing that is on the screen is worth keeping.
   */
  useEffect(() => {
    let active = true;
    setItems(null);
    waiting.current = [];
    void (async () => {
      const res = await fetchPage(0);
      if (!active) return;
      if (res.ok) {
        setItems(res.data.items ?? []);
        setEnd((res.data.items ?? []).length < PAGE);
        setError(null);
      } else {
        setError(res.error);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchPage]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const res = await fetchPage(0);
    if (res.ok) {
      waiting.current = [];
      setItems(res.data.items ?? []);
      setEnd((res.data.items ?? []).length < PAGE);
      setError(null);
    }
    setRefreshing(false);
  }, [fetchPage]);

  /*
   * Coming back to the wall — from a post, a profile, the composer, another
   * tab — finds it as it was left: the same posts, at the same place. It used
   * to be emptied and asked for again on every return, so a reader twenty
   * posts down opened one, came back, and was at the top of a grey page.
   *
   * It is asked for again all the same, quietly: what is already shown takes
   * its new counts in place (a like given on the post's own page), and
   * nothing is taken away. Posts that are new go on top only while the wall
   * is at its top, where they push nothing the reader is looking at; further
   * down they wait until the wall is back there — a pull, or a tap on the
   * Home tab, which is the way to ask for the newest. A quiet read that fails
   * says nothing: what is shown is still true enough.
   */
  const latest = useRef({ fetchPage, refresh, loaded: false, failed: false });
  latest.current = { fetchPage, refresh, loaded: items !== null, failed: error !== null };
  useFocusEffect(
    useCallback(() => {
      const now = latest.current;
      // the first load is the effect's above; one that failed is asked for again in full
      if (!now.loaded) {
        if (now.failed) void now.refresh();
        return;
      }
      let active = true;
      const asked = now.fetchPage;
      void (async () => {
        const res = await asked(0);
        // answered after the reader chose another way of reading the wall: not this wall's posts
        if (!active || !res.ok || latest.current.fetchPage !== asked) return;
        const fresh = res.data.items ?? [];
        setItems((prev) => {
          if (!prev) return prev;
          const merged = mergeFresh(prev, fresh, atTop.current);
          waiting.current = merged.waiting;
          return merged.items;
        });
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  /** The wall is at its top again: the posts that arrived while it was not go on it. */
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    atTop.current = e.nativeEvent.contentOffset.y <= 0;
    if (!atTop.current || waiting.current.length === 0) return;
    const arrived = waiting.current;
    waiting.current = [];
    setItems((prev) => (prev ? mergeFresh(prev, arrived, true).items : prev));
  }, []);

  // a pull asks the friends row again too: who is online moves faster than the wall
  const [pulls, setPulls] = useState(0);
  const onPull = useCallback(async () => {
    setPulls((n) => n + 1);
    await refresh();
  }, [refresh]);

  const loadMore = useCallback(async () => {
    if (loadingMore || end || !items) return;
    setLoadingMore(true);
    const res = await fetchPage(items.length);
    if (res.ok) {
      const batch = res.data.items ?? [];
      // a ranked wall can shift between two pages: a post already shown is not shown twice
      setItems((prev) => {
        if (!prev) return batch;
        const seen = new Set(prev.map((i) => i.key));
        return [...prev, ...batch.filter((i) => !seen.has(i.key))];
      });
      setEnd(batch.length < PAGE);
    }
    setLoadingMore(false);
  }, [fetchPage, loadingMore, end, items]);

  /** Replace one card in place, so a like does not reload the wall. */
  const replace = useCallback((next: FeedItem) => {
    setItems((prev) => (prev ?? []).map((i) => (i.key === next.key ? next : i)));
  }, []);

  // a post you deleted leaves the wall at once, reposts of it included
  useEffect(() => onPostDeleted((gone) => setItems((prev) => prev && prev.filter((i) => !samePost(i, gone)))), []);

  // the first screenful rises in once, as the wall arrives
  const entering = useListEntrance(!!items && items.length > 0);
  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <Rise delay={entering(index)}>
        <FeedCard item={item} onChanged={replace} />
      </Rise>
    ),
    [replace, entering],
  );

  const plain = isDefaultFilter(filter);
  const narrowed = filterLabel(t, filter);
  const ordered = sortLabel(t, filter);
  const summary = filterSummary(t, filter);

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        <View style={[styles.bar, { flexDirection: dir.row }]}>
          <Text style={[styles.wordmark, dir.text, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={1}>
            Hevalo
          </Text>
          {/* sorting and narrowing the wall is one button, out of the way until it is wanted, and filled while either is on */}
          <HeaderButton
            icon={plain ? 'filter' : 'filter-fill'}
            label={summary ? t('feed.sortFilter.buttonOn', { what: summary }) : t('feed.sortFilter.button')}
            onPress={() => setFiltering(true)}
            testID="home-filter"
          />
          <HeaderButton icon="plus" label={t('post.open')} onPress={compose} testID="home-post" />
          <NotificationBell />
        </View>

        <FlatList
          ref={listRef}
          data={items ?? []}
          keyExtractor={(i) => i.key}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: tabBarInset }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(onPull)} tintColor={colors.textSecondary} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          onScroll={onScroll}
          scrollEventThrottle={64}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <FriendsRow refreshKey={pulls} />
              {plain ? null : (
                <FilterChips style={styles.filterChips}>
                  {ordered ? (
                    <FilterChip
                      icon="sort"
                      label={ordered}
                      clearLabel={t('feed.sort.clear')}
                      onOpen={() => setFiltering(true)}
                      onClear={() => choose({ ...filter, sort: DEFAULT_FILTER.sort, period: DEFAULT_FILTER.period })}
                    />
                  ) : null}
                  {narrowed ? (
                    <FilterChip
                      icon="filter-fill"
                      label={narrowed}
                      clearLabel={t('civak.filter.clear')}
                      onOpen={() => setFiltering(true)}
                      onClear={() => choose({ ...filter, section: 'all', kind: null })}
                    />
                  ) : null}
                </FilterChips>
              )}
            </>
          }
          ListEmptyComponent={
            items === null ? (
              // the faces and the filters stay put while the posts load, or fail to
              <View style={styles.waiting}>
                <AsyncBoundary loading={!error} error={error} onRetry={() => void refresh()} skeleton={<FeedSkeleton />}>
                  {null}
                </AsyncBoundary>
              </View>
            ) : plain ? (
              /*
               * A new reader's wall is empty because they follow nobody and
               * have written nothing, so it offers both, and nothing else:
               * finding people first, since a wall of other people's posts
               * is what makes the second one worth doing.
               */
              <EmptyState
                title={t('civak.empty.welcome')}
                body={t('civak.empty.body')}
                action={{ label: t('civak.empty.findPeople'), onPress: () => navigation.navigate('Search') }}
                secondary={{ label: t('civak.empty.write'), onPress: compose }}
              />
            ) : (
              // nothing in what was asked for: the way back to the whole wall first
              <EmptyState
                title={t('civak.empty')}
                body={t('civak.empty.body')}
                action={{ label: t('civak.filter.clear'), onPress: () => choose(DEFAULT_FILTER) }}
                secondary={{ label: t('post.open'), onPress: compose }}
              />
            )
          }
          ListFooterComponent={
            loadingMore ? <Loading style={{ marginVertical: spacing.md }} /> : null
          }
        />
        <FeedFilterSheet visible={filtering} value={filter} onApply={choose} onClose={() => setFiltering(false)} />
      </View>
    </GradientBackground>
  );
}

/**
 * A wall that is showing, brought up to date with a first page just read:
 * each post already on it takes what the read says about it, in its place,
 * and none is dropped. The posts the wall did not have go on top when
 * `onTop` says they may, in the order the read gave them; otherwise they are
 * handed back as `waiting`, for when the wall is at its top.
 */
export function mergeFresh(shown: readonly FeedItem[], fresh: readonly FeedItem[], onTop: boolean): { items: FeedItem[]; waiting: FeedItem[] } {
  const read = new Map(fresh.map((i) => [i.key, i]));
  const have = new Set(shown.map((i) => i.key));
  const kept = shown.map((i) => read.get(i.key) ?? i);
  const unseen = fresh.filter((i) => !have.has(i.key));
  return onTop ? { items: [...unseen, ...kept], waiting: [] } : { items: kept, waiting: unseen };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // the bell reaches past the gutter so its glyph, not its target, lines up with the name's edge
  bar: { alignItems: 'center', paddingHorizontal: layout.gutter, minHeight: 44 },
  wordmark: { ...display(typography.sizes.xl), flex: 1 },
  waiting: { paddingHorizontal: layout.gutter },
  // the chips under the faces, inside the page's gutter
  filterChips: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
});
