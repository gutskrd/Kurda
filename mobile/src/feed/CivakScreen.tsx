import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Rise } from '../theme/MotionParts';
import { useListEntrance } from '../theme/animate';
import { refreshFelt } from '../feedback/haptics';
import { useAuth } from '../auth/AuthContext';
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
  FeedFilterChip,
  FeedFilterChips,
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
 */
export function CivakScreen(): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const topInset = useScreenTopInset();
  const { refresh: refreshBadges } = useUnread();

  const navigation = useNavigation<TabNavigation>();
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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setItems(null);
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
    }, [fetchPage]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const res = await fetchPage(0);
    if (res.ok) {
      setItems(res.data.items ?? []);
      setEnd((res.data.items ?? []).length < PAGE);
      setError(null);
    }
    setRefreshing(false);
  }, [fetchPage]);

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
          <HeaderButton icon="plus" label={t('post.open')} onPress={() => navigation.navigate('Compose')} testID="home-post" />
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
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <FriendsRow refreshKey={pulls} />
              {plain ? null : (
                <FeedFilterChips>
                  {ordered ? (
                    <FeedFilterChip
                      icon="sort"
                      label={ordered}
                      clearLabel={t('feed.sort.clear')}
                      onOpen={() => setFiltering(true)}
                      onClear={() => choose({ ...filter, sort: DEFAULT_FILTER.sort, period: DEFAULT_FILTER.period })}
                    />
                  ) : null}
                  {narrowed ? (
                    <FeedFilterChip
                      icon="filter-fill"
                      label={narrowed}
                      clearLabel={t('civak.filter.clear')}
                      onOpen={() => setFiltering(true)}
                      onClear={() => choose({ ...filter, section: 'all', kind: null })}
                    />
                  ) : null}
                </FeedFilterChips>
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
                secondary={{ label: t('civak.empty.write'), onPress: () => navigation.navigate('Compose') }}
              />
            ) : (
              // nothing in what was asked for: the way back to the whole wall first
              <EmptyState
                title={t('civak.empty')}
                body={t('civak.empty.body')}
                action={{ label: t('civak.filter.clear'), onPress: () => choose(DEFAULT_FILTER) }}
                secondary={{ label: t('post.open'), onPress: () => navigation.navigate('Compose') }}
              />
            )
          }
          ListFooterComponent={
            loadingMore ? <ActivityIndicator color={colors.textSecondary} style={{ marginVertical: spacing.md }} /> : null
          }
        />
        <FeedFilterSheet visible={filtering} value={filter} onApply={choose} onClose={() => setFiltering(false)} />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // the bell reaches past the gutter so its glyph, not its target, lines up with the name's edge
  bar: { alignItems: 'center', paddingHorizontal: layout.gutter, minHeight: 44 },
  wordmark: { ...display(typography.sizes.xl), flex: 1 },
  waiting: { paddingHorizontal: layout.gutter },
});
