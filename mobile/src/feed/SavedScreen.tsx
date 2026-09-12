import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { getSaved } from './api';
import { FeedCard } from './FeedCard';
import type { FeedItem } from './types';

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
  const topInset = useScreenTopInset();

  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const fetchPage = useCallback((offset: number) => getSaved(client, { limit: PAGE, offset }), [client]);

  useFocusEffect(
    useCallback(() => {
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

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => <FeedCard item={item} onChanged={changed} />,
    [changed],
  );

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        <View style={styles.titleRow}>
          <Pressable onPress={onExit} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.back')}>
            <Icon name="chevron-left" size={24} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.primary }]}>{t('saved.title')}</Text>
          <View style={{ width: 24 }} />
        </View>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('saved.subtitle')}</Text>

        <AsyncBoundary loading={items === null} error={items === null ? error : null} onRetry={() => void refresh()}>
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                {`${t('saved.emptyLead')} ${t('nav.civak')} ${t('saved.emptyTail')}`}
              </Text>
            }
            ListFooterComponent={
              loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null
            }
          />
        </AsyncBoundary>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  sub: { fontSize: typography.sizes.sm, marginBottom: spacing.md },
  list: { paddingBottom: 120, gap: spacing.md },
  empty: { textAlign: 'center', marginTop: spacing.xl },
});
