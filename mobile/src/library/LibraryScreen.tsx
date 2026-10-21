import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SkeletonText } from '../theme/Skeleton';
import { PressableScale, Rise } from '../theme/MotionParts';
import { useListEntrance } from '../theme/animate';
import { refreshFelt } from '../feedback/haptics';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { listPosts } from './api';
import { bodyPreview, postName, type LibraryPost, type PostType } from './types';
import { onPostDeleted } from '../composer/postDeleted';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState } from '../theme/EmptyState';

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
  const { t } = useI18n();

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

  // a post deleted on its own page is gone from here before the list reloads
  useEffect(
    () =>
      onPostDeleted((gone) => {
        if (gone.targetType === 'library') setPosts((prev) => prev && prev.filter((p) => p.id !== gone.id));
      }),
    [],
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

  // the first screenful rises in once, as the list arrives
  const entering = useListEntrance(!!posts && posts.length > 0);
  const renderItem = useCallback(
    ({ item, index }: { item: LibraryPost; index: number }) => (
      <Rise delay={entering(index)}>
        <PressableScale
          onPress={() => navigation.navigate('LibraryPost', { postId: item.id })}
          style={[styles.card, { backgroundColor: colors.glassFill }]}
          accessibilityRole="button"
          accessibilityLabel={t('library.readLabel', { title: postName(item) })}
        >
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {postName(item)}
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
        </PressableScale>
      </Rise>
    ),
    [navigation, colors, entering],
  );

  return (
    <GradientBackground>
      <ScreenHeader title={t('library.title')} onBack={onExit} />
      <View style={styles.screen}>

        <View style={styles.filters}>
          <Segmented
            options={['story', 'poem'] as const}
            value={type}
            onChange={setType}
            labelOf={(kind) => t(kind === 'story' ? 'library.kind.stories' : 'library.kind.poems')}
          />
          <Segmented
            options={['newest', 'popular'] as const}
            value={sort}
            onChange={setSort}
            labelOf={(order) => t(order === 'newest' ? 'library.sort.newest' : 'library.sort.popular')}
          />
        </View>

        <AsyncBoundary loading={posts === null} error={posts === null ? error : null} onRetry={() => void refresh()} skeleton={<LibrarySkeleton />}>
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <EmptyState
                title={t('library.empty')}
                action={{ label: t('library.emptyAction'), onPress: () => navigation.navigate('Compose') }}
              />
            }
            ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null}
          />
        </AsyncBoundary>

        <View style={styles.fab}>
          <ClayButton label={t('library.emptyAction')} tone="primary" onPress={() => navigation.navigate('Compose')} />
        </View>
      </View>
    </GradientBackground>
  );
}

/** The list while it loads: the same cards — a title, two lines, the counts — as many as fill the screen. */
function LibrarySkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { height, width } = useWindowDimensions();
  const count = Math.max(3, Math.ceil(height / 130));
  // the two-line preview fits on one across a wide tablet
  const wide = width >= 900;
  return (
    <View style={styles.list} accessibilityLabel={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.glassFill }]}>
          <View style={styles.cardHead}>
            <SkeletonText size={typography.sizes.lg} width={i % 2 ? '48%' : '62%'} style={styles.flex} />
          </View>
          <View>
            <SkeletonText size={typography.sizes.md} width={wide ? '64%' : '96%'} />
            {wide ? null : <SkeletonText size={typography.sizes.md} width="70%" />}
          </View>
          <View style={styles.cardFoot}>
            <SkeletonText size={typography.sizes.sm} width={44} />
            <SkeletonText size={typography.sizes.sm} width={36} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  filters: { gap: spacing.sm, marginBottom: spacing.md },
  list: { paddingBottom: 120, gap: spacing.md },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  preview: { fontSize: typography.sizes.md },
  cardFoot: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  stat: { fontSize: typography.sizes.sm },
  fab: { position: 'absolute', right: spacing.lg, bottom: spacing.xl },
});
