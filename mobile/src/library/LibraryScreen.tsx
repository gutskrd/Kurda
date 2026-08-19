import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { listPosts } from './api';
import { bodyPreview, type LibraryPost, type PostType } from './types';

const PAGE = 20;

/**
 * Community library browse (KUR-284): stories & poems, filter by type + sort,
 * infinite scroll, pull-to-refresh. Tapping a post opens it to read/listen +
 * comment; "Write" opens the composer.
 */
export function LibraryScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const topInset = useScreenTopInset();

  const [type, setType] = useState<PostType>('story');
  const [sort, setSort] = useState<'newest' | 'popular'>('newest');
  const [posts, setPosts] = useState<LibraryPost[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const fetchPage = useCallback(
    (offset: number) => listPosts(client, { type, sort, limit: PAGE, offset }),
    [client, type, sort],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const res = await fetchPage(0);
        if (!active) return;
        if (res.ok) {
          setPosts(res.data.posts);
          setEnd(res.data.posts.length < PAGE);
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
      setPosts(res.data.posts);
      setEnd(res.data.posts.length < PAGE);
      setError(null);
    }
    setRefreshing(false);
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || end || !posts) return;
    setLoadingMore(true);
    const res = await fetchPage(posts.length);
    if (res.ok) {
      setPosts((prev) => (prev ? [...prev, ...res.data.posts] : res.data.posts));
      setEnd(res.data.posts.length < PAGE);
    }
    setLoadingMore(false);
  }, [fetchPage, loadingMore, end, posts]);

  const renderItem = useCallback(
    ({ item }: { item: LibraryPost }) => (
      <Pressable
        onPress={() => navigation.navigate('LibraryPost', { postId: item.id })}
        style={[styles.card, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}
        accessibilityRole="button"
        accessibilityLabel={`Read ${item.title}`}
      >
        <View style={styles.cardHead}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.title}
          </Text>
          {item.audioUrl ? <Icon name="speaker" size={16} tone="primary" /> : null}
        </View>
        <Text style={[styles.preview, { color: colors.textSecondary }]} numberOfLines={2}>
          {bodyPreview(item.body)}
        </Text>
        <View style={styles.cardFoot}>
          <Text style={[styles.stat, { color: colors.textSecondary }]}>👁 {item.viewCount}</Text>
          <Text style={[styles.stat, { color: colors.textSecondary }]}>💬 {item.commentCount}</Text>
        </View>
      </Pressable>
    ),
    [navigation, colors],
  );

  return (
    <GradientBackground>
      <View style={[styles.screen, { paddingTop: topInset }]}>
        <View style={styles.titleRow}>
          <Pressable onPress={onExit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
            <Icon name="chevron-left" size={24} color={colors.textSecondary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.primary }]}>Library</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.filters}>
          <Segmented options={['story', 'poem'] as const} value={type} onChange={setType} labelOf={(t) => (t === 'story' ? 'Stories' : 'Poems')} />
          <Segmented options={['newest', 'popular'] as const} value={sort} onChange={setSort} labelOf={(s) => (s === 'newest' ? 'Newest' : 'Popular')} />
        </View>

        <AsyncBoundary loading={posts === null} error={posts === null ? error : null} onRetry={() => void refresh()}>
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>Nothing here yet — write the first!</Text>}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null}
          />
        </AsyncBoundary>

        <View style={styles.fab}>
          <ClayButton label="+ Write" tone="primary" onPress={() => navigation.navigate('LibraryCompose')} />
        </View>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  filters: { gap: spacing.sm, marginBottom: spacing.md },
  list: { paddingBottom: 120, gap: spacing.md },
  card: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, gap: spacing.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  preview: { fontSize: typography.sizes.md },
  cardFoot: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  stat: { fontSize: typography.sizes.sm },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.xl },
});
