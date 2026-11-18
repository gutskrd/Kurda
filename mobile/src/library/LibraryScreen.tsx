import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { FlatList, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SkeletonText } from '../theme/Skeleton';
import { PressableScale, Rise } from '../theme/MotionParts';
import { useListEntrance } from '../theme/animate';
import { refreshFelt } from '../feedback/haptics';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { listPosts } from './api';
import { bodyPreview, postName, type LibraryPost, type PostType } from './types';
import { onPostDeleted } from '../composer/postDeleted';
import { useQuietRefocus } from '../feed/keep';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { EmptyState } from '../theme/EmptyState';
import { Loading } from '../theme/Loading';

const PAGE = 20;

/**
 * The community library: stories and poems with type filter and sort, infinite scroll and pull to refresh. A post
 * opens to read, listen and comment; "Write" opens the composer.
 */
export function LibraryScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  // In Soranî and Arabic the cards and the button mirror, and a title keeps its own direction.
  const dir = useDirection();

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

  /* Returning from a post keeps the list as it was, every loaded page at the same place, and refreshes it quietly (feed/keep.ts). */
  const { onScroll, forget } = useQuietRefocus<LibraryPost>({
    loaded: posts !== null,
    list: fetchPage,
    readFirst: async () => {
      const res = await fetchPage(0);
      return res.ok ? res.data.posts : null;
    },
    keyOf: postId,
    pageSize: PAGE,
    apply: (update) => setPosts((prev) => (prev ? update(prev) : prev)),
    retry: error ? () => void refresh() : undefined,
  });

  // The list as it first opens, and again for another kind of writing or another order.
  useEffect(() => {
    let active = true;
    forget();
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
    // `forget` is the same function for as long as the screen is there.
  }, [fetchPage]);

  // A post deleted on its own page is gone from here before the list reloads.
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
      forget();
      setPosts(res.data.posts);
      setEnd(res.data.posts.length < PAGE);
      setError(null);
    }
    setRefreshing(false);
    // `forget` is the same function for as long as the screen is there.
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

  // The first screenful rises in once, as the list arrives.
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
          <View style={[styles.cardHead, { flexDirection: dir.row }]}>
            <Text style={[styles.cardTitle, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
              {postName(item)}
            </Text>
            {item.audioUrl ? <Icon name="speaker" size={16} tone="primary" /> : null}
          </View>
          <Text style={[styles.preview, dir.free, { color: colors.textSecondary }]} numberOfLines={2}>
            {bodyPreview(item.body)}
          </Text>
          {/* Read and reply counts, with the app's glyphs in the caption colour. */}
          <View style={[styles.cardFoot, { flexDirection: dir.row }]}>
            <View style={[styles.stat, { flexDirection: dir.row }]}>
              <Icon name="eye" size={STAT_GLYPH} color={colors.textSecondary} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.viewCount}</Text>
            </View>
            <View style={[styles.stat, { flexDirection: dir.row }]}>
              <Icon name="chat" size={STAT_GLYPH} color={colors.textSecondary} />
              <Text style={[styles.statText, { color: colors.textSecondary }]}>{item.commentCount}</Text>
            </View>
          </View>
        </PressableScale>
      </Rise>
    ),
    [navigation, colors, entering, dir, t],
  );

  return (
    <GradientBackground>
      <ScreenHeader title={t('library.title')} onBack={onExit} browse />
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
            testID="library-list"
            onScroll={onScroll}
            scrollEventThrottle={64}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.textSecondary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <EmptyState
                title={t('library.empty')}
                action={{ label: t('library.emptyAction'), onPress: () => navigation.navigate('Compose') }}
              />
            }
            ListFooterComponent={loadingMore ? <Loading style={{ marginVertical: spacing.md }} /> : null}
          />
        </AsyncBoundary>

        {/* At the end of the line, which is the left in Soranî and Arabic. */}
        <View style={[styles.fab, dir.row === 'row-reverse' ? styles.fabLeft : styles.fabRight]}>
          <ClayButton label={t('library.emptyAction')} tone="primary" onPress={() => navigation.navigate('Compose')} />
        </View>
      </View>
    </GradientBackground>
  );
}

/** The loading placeholder: cards like the real ones (a title, two lines, the counts), as many as fill the screen. */
function LibrarySkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { height, width } = useWindowDimensions();
  const count = Math.max(3, Math.ceil(height / 130));
  // The two-line preview fits on one across a wide tablet.
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

/** The glyph beside a count, at the height of the caption it sits with. */
const STAT_GLYPH = 15;

/** A post's own name in the list. */
const postId = (post: LibraryPost): string => post.id;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: layout.gutter },
  filters: { gap: spacing.sm, marginBottom: spacing.md },
  list: { paddingBottom: 120, gap: spacing.md },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  preview: { fontSize: typography.sizes.md },
  cardFoot: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
  stat: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statText: { fontSize: typography.sizes.sm },
  fab: { position: 'absolute', bottom: spacing.xl },
  fabRight: { right: spacing.lg },
  fabLeft: { left: spacing.lg },
});
