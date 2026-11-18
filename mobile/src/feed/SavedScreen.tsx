import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Rise } from '../theme/MotionParts';
import { useListEntrance } from '../theme/animate';
import { refreshFelt } from '../feedback/haptics';
import { useAuth } from '../auth/AuthContext';
import { layout, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import type { RootNavigation } from '../navigation/rootStack';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { EmptyState } from '../theme/EmptyState';
import { useDirection } from '../reports/direction';
import { getSaved } from './api';
import { useQuietRefocus } from './keep';
import { FeedCard, FeedSkeleton } from './FeedCard';
import type { FeedItem } from './types';
import { onPostDeleted, samePost } from '../composer/postDeleted';
import { Loading } from '../theme/Loading';

const PAGE = 20;

/**
 * The posts you saved, the same list the web app shows, scoped to you by the server. Unsaving here removes the
 * card, so the list never shows an unsaved post until the next reload. Posts run full width with hairlines
 * between, as on Home.
 */
export function SavedScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  const dir = useDirection();
  // Nothing floats over the foot of this page: the last post only has to clear the home indicator.
  const bottom = useScreenBottomInset(spacing.lg);

  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const fetchPage = useCallback((offset: number) => getSaved(client, { limit: PAGE, offset }), [client]);

  /*
   * Returning from a post keeps the list as it was, every loaded page at the same place, and refreshes it quietly
   * (feed/keep.ts): a post unsaved on its own page disappears and nothing else moves.
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
    // What the reload says is no longer saved is removed from the list of saved posts.
    apply: (update) => setItems((prev) => (prev ? update(prev).filter((i) => i.engagement.bookmarked) : prev)),
    retry: error ? () => void refresh() : undefined,
  });

  // The list as it first opens.
  useEffect(() => {
    let active = true;
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
      forget();
      setItems(res.data.items ?? []);
      setEnd((res.data.items ?? []).length < PAGE);
      setError(null);
    }
    setRefreshing(false);
    // `forget` is the same function for as long as the screen is there.
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || end || !items) return;
    setLoadingMore(true);
    const res = await fetchPage(items.length);
    if (res.ok) {
      const batch = res.data.items ?? [];
      setItems((prev) => (prev ? [...prev, ...batch] : batch));
      setEnd(batch.length < PAGE);
    }
    setLoadingMore(false);
  }, [fetchPage, loadingMore, end, items]);

  /** Keep the totals, but drop anything that has just been unsaved. */
  const changed = useCallback((next: FeedItem) => {
    setItems((prev) =>
      (prev ?? []).flatMap((i) => (i.key !== next.key ? [i] : next.engagement.bookmarked ? [next] : [])),
    );
  }, []);

  // A post you deleted is not kept here either.
  useEffect(() => onPostDeleted((gone) => setItems((prev) => prev && prev.filter((i) => !samePost(i, gone)))), []);

  const entering = useListEntrance(!!items && items.length > 0);
  const renderItem = useCallback(
    ({ item, index }: { item: FeedItem; index: number }) => (
      <Rise delay={entering(index)}>
        <FeedCard item={item} onChanged={changed} />
      </Rise>
    ),
    [changed, entering],
  );

  return (
    <GradientBackground>
      <ScreenHeader title={t('saved.title')} onBack={onExit} browse />
      <View style={styles.screen}>
        <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]}>{t('saved.subtitle')}</Text>

        <AsyncBoundary
          loading={items === null}
          error={items === null ? error : null}
          onRetry={() => void refresh()}
          skeleton={<FeedSkeleton />}
        >
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: bottom }}
            onScroll={onScroll}
            scrollEventThrottle={64}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.textSecondary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              // What belongs here, and the way to the posts there are to keep.
              <EmptyState
                title={t('saved.empty')}
                body={t('saved.empty.body')}
                action={{ label: t('saved.empty.browse'), onPress: () => navigation.popTo('Tabs', { screen: 'Home' }) }}
              />
            }
            ListFooterComponent={
              loadingMore ? <Loading style={{ marginVertical: spacing.md }} /> : null
            }
          />
        </AsyncBoundary>
      </View>
    </GradientBackground>
  );
}

/** A post's own name in the list: a repost and the post it repeats are two. */
const feedKey = (item: FeedItem): string => item.key;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // In the page's gutter, where the posts' own words start.
  sub: { fontSize: typography.sizes.sm, marginBottom: spacing.sm, paddingHorizontal: layout.gutter },
});
