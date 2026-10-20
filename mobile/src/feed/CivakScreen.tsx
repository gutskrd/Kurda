import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { layout, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { GradientBackground, Segmented } from '../theme/glass';
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
import { FeedCard } from './FeedCard';
import { SECTIONS, kindWithin, type FeedItem, type FeedSection } from './types';
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
 * Its header is the app's own: a "+" to post at the start, the name in the
 * middle, and at the end the bell — notifications live here now, a tap from
 * the screen people open first, with a dot while any are unread.
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

  /** Replace one card in place, so a like does not reload the wall. */
  const replace = useCallback((next: FeedItem) => {
    setItems((prev) => (prev ?? []).map((i) => (i.key === next.key ? next : i)));
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => <FeedCard item={item} onChanged={replace} />,
    [replace],
  );

  const everything = section === 'all' && !kind;

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        <View style={[styles.bar, { flexDirection: dir.row }]}>
          {/*
           * Posting is a "+", at the start of the bar: it says "add" and
           * nothing about what, and it sits beside the wall it adds to. It
           * used to be a filled circle beside the filters, the loudest thing
           * on the screen; it is an ordinary header control now.
           */}
          <HeaderButton icon="plus" label={t('post.open')} onPress={() => navigation.navigate('Compose')} edge="start" testID="home-post" />
          <Text style={[styles.wordmark, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={1}>
            Hevalo
          </Text>
          <NotificationBell />
        </View>

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
            ref={listRef}
            data={items}
            keyExtractor={(i) => i.key}
            renderItem={renderItem}
            contentContainerStyle={[styles.list, { paddingBottom: tabBarInset }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.textSecondary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              everything ? (
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
                <EmptyState
                  title={t('civak.empty')}
                  body={t('civak.empty.body')}
                  action={{ label: t('post.open'), onPress: () => navigation.navigate('Compose') }}
                />
              )
            }
            ListFooterComponent={
              loadingMore ? <ActivityIndicator color={colors.textSecondary} style={{ marginVertical: spacing.md }} /> : null
            }
          />
        </AsyncBoundary>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: layout.gutter },
  // the two controls are the same width, so the name between them is centred
  bar: { alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  wordmark: { ...display(typography.sizes.xl), flex: 1, textAlign: 'center' },
  filters: { gap: spacing.sm, marginBottom: spacing.md },
  list: { gap: layout.rowGap },
});
