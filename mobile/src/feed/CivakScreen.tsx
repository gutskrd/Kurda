import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon } from '../theme/Icon';
import { Rise, heldDim } from '../theme/MotionParts';
import { useListEntrance } from '../theme/animate';
import { refreshFelt } from '../feedback/haptics';
import { useAuth } from '../auth/AuthContext';
import { useAccountGate } from '../auth/AccountGate';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import type { TabNavigation } from '../navigation/rootStack';
import { useTabBarInset } from '../navigation/tabBarLayout';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { HeaderButton } from '../navigation/HeaderButton';
import { TabHeader } from '../navigation/TopBar';
import { useUnread } from '../messages/unread';
import { useDirection } from '../reports/direction';
import { getFeed } from './api';
import { useQuietRefocus } from './keep';
import { FeedCard, FeedSkeleton } from './FeedCard';
import { FriendsRow } from './FriendsRow';
import type { FeedItem } from './types';
import {
  DEFAULT_FILTER,
  FeedFilterSheet,
  filterLabel,
  isDefaultFilter,
  normalise,
  sortLabel,
  type FeedFilterValue,
} from './FeedFilter';
import { onPostDeleted, samePost, useDeleting } from '../composer/postDeleted';
import { EmptyState } from '../theme/EmptyState';
import { FilterChip, FilterChips } from '../theme/FilterSheet';
import { Loading } from '../theme/Loading';

const PAGE = 20;

/**
 * Home: everything the community has written and posted, on one wall, reading the same `/feed` as the web app,
 * with a filter for one kind.
 *
 * The header follows the familiar social-home shape: the name at the start, and at the end a "+" to post and the
 * notifications bell with a dot while any are unread. Below are the row of friends' faces, the filters, then the
 * posts at full screen width, so a picture is the size of the phone.
 *
 * The wall loads from its skeleton only on first open and when the way of reading it changes. Returning to it
 * keeps the posts and position and refreshes silently.
 */
export function CivakScreen(): React.JSX.Element {
  const { client } = useAuth();
  // A guest reads the wall; writing on it is the account's (auth/AccountGate).
  const { require } = useAccountGate();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const { refresh: refreshBadges } = useUnread();

  const navigation = useNavigation<TabNavigation>();
  const compose = useCallback(() => {
    if (require('post')) navigation.navigate('Compose');
  }, [require, navigation]);
  const listRef = useRef<FlatList<FeedItem>>(null);
  // Tapping Home while on Home goes back to the newest post.
  useScrollToTop(listRef);
  const tabBarInset = useTabBarInset();
  // In what order the wall is read, from how far back, and which posts.
  const [filter, setFilter] = useState<FeedFilterValue>(DEFAULT_FILTER);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const [filtering, setFiltering] = useState(false);

  /** A new way of reading the wall: from its top, the posts asked for again. */
  const choose = useCallback((next: FeedFilterValue) => {
    setFilter(normalise(next));
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const fetchPage = useCallback(
    (offset: number) => getFeed(client, { section: filter.section, kind: filter.kind, sort: filter.sort, period: filter.period, limit: PAGE, offset }),
    [client, filter],
  );

  /*
   * Returning to the wall (from a post, profile, composer or another tab) keeps the same posts at the same place
   * and refreshes silently (feed/keep.ts). A failed first load is retried in full.
   */
  const { onScroll, forget } = useQuietRefocus<FeedItem>({
    loaded: items !== null,
    list: fetchPage,
    readFirst: async () => {
      const res = await fetchPage(0);
      return res.ok ? (res.data.items ?? []) : null;
    },
    keyOf: feedKey,
    pageSize: PAGE,
    apply: (update) => setItems((prev) => (prev ? update(prev) : prev)),
    retry: error ? () => void refresh() : undefined,
  });

  // The bell's dot is worth getting right on the screen it sits on.
  useFocusEffect(
    useCallback(() => {
      refreshBadges({ soon: true });
    }, [refreshBadges]),
  );

  /*
   * The wall's first load, and a fresh load from the skeleton when the order or kind changes, the two times
   * nothing on screen is worth keeping.
   */
  useEffect(() => {
    let active = true;
    setItems(null);
    forget();
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
    // `forget` is the same function for as long as the screen is there.
  }, [fetchPage]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const res = await fetchPage(0);
    if (res.ok) {
      forget();
      setItems(res.data.items ?? []);
      setEnd((res.data.items ?? []).length < PAGE);
      setError(null);
    }
    setRefreshing(false);
    // `forget` is the same function for as long as the screen is there.
  }, [fetchPage]);

  // A pull asks the friends row again too: who is online moves faster than the wall.
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
      // A ranked wall can shift between two pages: a post already shown is not shown twice.
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

  // A post you deleted leaves the wall at once, reposts of it included.
  useEffect(() => onPostDeleted((gone) => setItems((prev) => prev && prev.filter((i) => !samePost(i, gone)))), []);
  const deleting = useDeleting();

  // The first screenful rises in once, as the wall arrives.
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

  return (
    <GradientBackground>
      <View style={styles.screen}>
        {/* The app's own name where a tab's is, and the one thing only this tab does: write on the wall. */}
        <TabHeader title="Hevalo" action={<HeaderButton icon="plus" label={t('post.open')} onPress={compose} testID="home-post" />} />

        <FlatList
          ref={listRef}
          data={(items ?? []).filter((i) => !deleting(i))}
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
              {plain ? (
                /* Sorting and filtering: one quiet chip over the first post saying the current choice, offered only once there are posts to sort. */
                (items?.length ?? 0) > 0 ? (
                  <View style={[styles.filterChips, { flexDirection: dir.row }]}>
                    <Pressable
                      onPress={() => setFiltering(true)}
                      accessibilityRole="button"
                      accessibilityLabel={t('feed.sortFilter.button')}
                      testID="home-filter"
                      // Alone on its line, so it reaches a fingertip past every edge.
                      reach="open"
                      style={({ pressed }) => [styles.sortChip, { flexDirection: dir.row, backgroundColor: colors.controlTrack }, pressed && heldDim]}
                    >
                      <Icon name="filter" size={16} color={colors.textSecondary} />
                      <Text style={[styles.sortChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                        {t('feed.sortFilter.button')}
                      </Text>
                    </Pressable>
                  </View>
                ) : null
              ) : (
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
              // The faces and the filters stay put while the posts load, or fail to.
              <View style={styles.waiting}>
                <AsyncBoundary loading={!error} error={error} onRetry={() => void refresh()} skeleton={<FeedSkeleton />}>
                  {null}
                </AsyncBoundary>
              </View>
            ) : plain ? (
              /*
               * A new reader's wall is empty because they follow nobody and have written nothing, so it offers
               * both, finding people first, since a wall of others' posts is what makes writing worth it.
               */
              <EmptyState
                title={t('civak.empty.welcome')}
                body={t('civak.empty.body')}
                action={{ label: t('civak.empty.findPeople'), onPress: () => navigation.navigate('Search') }}
                secondary={{ label: t('civak.empty.write'), onPress: compose }}
              />
            ) : (
              // Nothing matches the filter: the way back to the whole wall comes first.
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

/** The sort chip: drawn a fingertip less a little tall; the Pressable makes up its reach. */
const CHIP = MIN_TOUCH_TARGET - 8;

/** A post's own name on the wall: a repost and the post it repeats are two. */
const feedKey = (item: FeedItem): string => item.key;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // The way into sorting and narrowing: a fingertip tall, as wide as its words.
  sortChip: { alignItems: 'center', gap: spacing.xs + 2, minHeight: CHIP, paddingHorizontal: spacing.md - 4, borderRadius: radii.pill },
  sortChipText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  waiting: { paddingHorizontal: layout.gutter },
  // The chips under the faces, inside the page's gutter.
  filterChips: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
});
