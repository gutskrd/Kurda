import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { spacing, typography } from '../theme/tokens';
import { GradientBackground, Segmented } from '../theme/glass';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { getFeed } from './api';
import { FeedCard } from './FeedCard';
import { SECTIONS, kindWithin, type FeedItem, type FeedSection } from './types';

const PAGE = 20;

/**
 * Civak — everything the community has written and posted, on one wall.
 *
 * The same wall the web app opens on, reading the same `/feed`. Before this the
 * phone had Library and Memes as two separate screens behind two links in the
 * Social tab, which meant a poem posted this morning was invisible to anyone
 * looking at pictures — the exact split the web app removed. One wall, one
 * card, and a filter for when you do want just one kind.
 */
export function CivakScreen(): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();

  const [section, setSection] = useState<FeedSection>('all');
  const [kind, setKind] = useState<string | null>(null);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const kinds = SECTIONS.find((s) => s.key === section)?.kinds ?? [];

  /** Changing half drops a kind that belonged to the other one. */
  const chooseSection = useCallback((next: FeedSection) => {
    setSection(next);
    setKind((prev) => kindWithin(next, prev));
  }, []);

  const fetchPage = useCallback(
    (offset: number) => getFeed(client, { section, kind, limit: PAGE, offset }),
    [client, section, kind],
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

  const renderItem = useCallback(({ item }: { item: FeedItem }) => <FeedCard item={item} />, []);

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        <Text style={[styles.title, { color: colors.primary }]}>{t('civak.title')}</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>{t('civak.subtitle')}</Text>

        <View style={styles.filters}>
          <Segmented
            options={SECTIONS.map((s) => s.key)}
            value={section}
            onChange={chooseSection}
            labelOf={(key) => t(SECTIONS.find((s) => s.key === key)!.labelKey)}
          />
          {/* the second level appears only once there is a half to narrow */}
          {kinds.length > 0 && (
            <Segmented
              options={['all', ...kinds.map((k) => k.key)]}
              value={kind ?? 'all'}
              onChange={(next) => setKind(next === 'all' ? null : next)}
              labelOf={(key) =>
                key === 'all' ? t('civak.filter.allKinds') : t(kinds.find((k) => k.key === key)!.labelKey)
              }
            />
          )}
        </View>

        <AsyncBoundary loading={items === null} error={items === null ? error : null} onRetry={() => void refresh()}>
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>{t('civak.empty')}</Text>}
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
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  sub: { fontSize: typography.sizes.sm, marginBottom: spacing.md },
  filters: { gap: spacing.sm, marginBottom: spacing.md },
  list: { paddingBottom: 120, gap: spacing.md },
  empty: { textAlign: 'center', marginTop: spacing.xl },
});
