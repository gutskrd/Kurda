import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Rise } from '../theme/MotionParts';
import { useListEntrance } from '../theme/animate';
import { refreshFelt } from '../feedback/haptics';
import { useAuth } from '../auth/AuthContext';
import { spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { getSaved } from './api';
import { useQuietRefocus } from './keep';
import { FeedCard, FeedSkeleton } from './FeedCard';
import type { FeedItem } from './types';
import { onPostDeleted, samePost } from '../composer/postDeleted';
import { Loading } from '../theme/Loading';

const PAGE = 20;

/**
 * The posts you kept.
 *
 * The bookmark on a card had nowhere to lead on the phone — you could save
 * something and never find it again. This is where it goes, the same list the
 * web app shows, scoped to you by the server.
 *
 * Unsaving from here removes the card, because a list of saved posts with an
 * unsaved one still sitting in it is a lie that survives until the next reload.
 */
export function SavedScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();

  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const fetchPage = useCallback((offset: number) => getSaved(client, { limit: PAGE, offset }), [client]);

  /*
   * Come back to from a post, the list is as it was left — every page that
   * was loaded, at the same place — and is brought up to date quietly
   * (feed/keep.ts): a post unsaved on its own page is gone from here, and
   * nothing else moves. It used to be replaced by its first page each time.
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
    // what the read says is no longer saved does not stay in a list of what is
    apply: (update) => setItems((prev) => (prev ? update(prev).filter((i) => i.engagement.bookmarked) : prev)),
    retry: error ? () => void refresh() : undefined,
  });

  // the list as it first opens
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
    // `forget` is the same function for as long as the screen is there
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

  // a post you deleted is not kept here either
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
      <ScreenHeader title={t('saved.title')} onBack={onExit} />
      <View style={styles.screen}>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('saved.subtitle')}</Text>

        <AsyncBoundary
          loading={items === null}
          error={items === null ? error : null}
          onRetry={() => void refresh()}
          skeleton={<FeedSkeleton style={styles.skeleton} />}
        >
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            onScroll={onScroll}
            scrollEventThrottle={64}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {`${t('saved.emptyLead')} ${t('nav.civak')} ${t('saved.emptyTail')}`}
              </Text>
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
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  sub: { fontSize: typography.sizes.sm, marginBottom: spacing.md },
  list: { paddingBottom: 120, gap: spacing.md },
  // the list's own gap, so the cards land where the grey ones stood
  skeleton: { gap: spacing.md },
  empty: { textAlign: 'center', marginTop: spacing.xl },
});
