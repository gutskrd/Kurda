import { useCallback, useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PressableScale, Rise } from '../theme/MotionParts';
import { useListEntrance } from '../theme/animate';
import { refreshFelt } from '../feedback/haptics';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { listPosts } from './api';
import { type Category, type ImagePost } from './types';
import { Icon } from '../theme/Icon';
import { noticeTime } from '../notifications/inbox';
import { onPostDeleted, useDeleting } from '../composer/postDeleted';
import { useQuietRefocus } from '../feed/keep';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState } from '../theme/EmptyState';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { Loading } from '../theme/Loading';
import { useDirection } from '../reports/direction';

const PAGE = 20;

/** The meme and image feed: published posts with filter and sort, infinite scroll, and a page per post. Posting opens the composer. */
export function MemeFeedScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();

  const [category, setCategory] = useState<Category>('meme');
  const [sort, setSort] = useState<'newest' | 'popular'>('newest');
  const [posts, setPosts] = useState<ImagePost[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);

  const load = useCallback(
    async (opts: { append?: boolean } = {}) => {
      const offset = opts.append && posts ? posts.length : 0;
      const res = await listPosts(client, { category, sort, limit: PAGE, offset });
      if (!res.ok) {
        if (!opts.append) setError(res.error);
        return;
      }
      setError(null);
      setEnd(res.data.posts.length < PAGE);
      setPosts((prev) => (opts.append && prev ? [...prev, ...res.data.posts] : res.data.posts));
    },
    [client, category, sort, posts],
  );

  /* Returning from a picture keeps the list as it was, every loaded page at the same place, and refreshes it quietly (feed/keep.ts). */
  const first = useCallback(() => listPosts(client, { category, sort, limit: PAGE, offset: 0 }), [client, category, sort]);
  const { onScroll, forget } = useQuietRefocus<ImagePost>({
    loaded: posts !== null,
    list: first,
    readFirst: async () => {
      const res = await first();
      return res.ok ? res.data.posts : null;
    },
    keyOf: postId,
    pageSize: PAGE,
    apply: (update) => setPosts((prev) => (prev ? update(prev) : prev)),
    retry: error ? () => void load() : undefined,
  });

  // The list as it first opens, and again whenever the filters change.
  useEffect(() => {
    let active = true;
    forget();
    void (async () => {
      const res = await first();
      if (!active) return;
      if (res.ok) {
        setError(null);
        setEnd(res.data.posts.length < PAGE);
        setPosts(res.data.posts);
      } else {
        setError(res.error);
      }
    })();
    return () => {
      active = false;
    };
    // `forget` is the same function for as long as the screen is there.
  }, [first]);

  // A picture deleted on its own page is gone from here before the list reloads.
  useEffect(
    () =>
      onPostDeleted((gone) => {
        if (gone.targetType === 'image') setPosts((prev) => prev && prev.filter((p) => p.id !== gone.id));
      }),
    [],
  );
  const deleting = useDeleting();

  const refresh = useCallback(async () => {
    setRefreshing(true);
    // Read afresh from its top: nothing is held back for the list before.
    forget();
    await load();
    setRefreshing(false);
    // `forget` is the same function for as long as the screen is there.
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || end || !posts) return;
    setLoadingMore(true);
    await load({ append: true });
    setLoadingMore(false);
  }, [load, loadingMore, end, posts]);

  /** Posting opens the shared composer; a post from here becomes a meme once it has a picture. */
  const compose = useCallback(() => navigation.navigate('Compose', { meme: true }), [navigation]);

  // The first screenful rises in once, as the list arrives.
  const entering = useListEntrance(!!posts && posts.length > 0);
  const renderItem = useCallback(
    ({ item, index }: { item: ImagePost; index: number }) => (
      <Rise delay={entering(index)}>
        <PressableScale
          onPress={() => navigation.navigate('MemeDetail', { postId: item.id })}
          style={[styles.card, { backgroundColor: colors.glassFill }]}
          accessibilityRole="button"
          accessibilityLabel={item.caption ? t('memes.openPostCaption', { caption: item.caption }) : t('memes.openPost')}
        >
          {/* The author's picture and name, as on the wall, and the time; an older server with no author shows only the time. */}
          <View style={[styles.cardHead, { flexDirection: dir.row }]}>
            {item.author ? (
              <View style={[styles.who, { flexDirection: dir.row }]}>
                <InitialsAvatar name={item.author.username} id={item.author.id} size={28} photoUrl={item.author.avatarUrl} />
                <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.author.username}
                </Text>
              </View>
            ) : (
              <View style={styles.who} />
            )}
            <Text style={[styles.age, { color: colors.textSecondary }]}>{noticeTime(item.createdAt, t, locale)}</Text>
          </View>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.image, styles.imageFallback, { backgroundColor: colors.controlTrack }]}>
              <Text style={{ color: colors.textSecondary }}>{t('memes.imageUnavailable')}</Text>
            </View>
          )}
          {item.caption ? <Text style={[styles.caption, dir.free, { color: colors.textPrimary }]}>{item.caption}</Text> : null}
          {/* The heart is the only reaction and is counted on the post; this is the comment count. */}
          {item.commentCount > 0 ? (
            <View style={[styles.cardFoot, { flexDirection: dir.row }]}>
              <Icon name="chat" size={16} color={colors.textSecondary} />
              <Text style={[styles.stat, { color: colors.textSecondary }]}>{item.commentCount}</Text>
            </View>
          ) : null}
        </PressableScale>
      </Rise>
    ),
    [navigation, colors, entering, t, locale, dir],
  );

  return (
    <GradientBackground>
      <ScreenHeader title={t('memes.title')} onBack={onExit} browse />
      <View style={styles.screen}>

        <View style={styles.filters}>
          <Segmented
            options={['meme', 'image'] as const}
            value={category}
            onChange={setCategory}
            labelOf={(c) => t(c === 'meme' ? 'memes.title' : 'memes.images')}
          />
          <Segmented
            options={['newest', 'popular'] as const}
            value={sort}
            onChange={setSort}
            labelOf={(v) => t(v === 'newest' ? 'memes.sortNewest' : 'memes.sortPopular')}
          />
        </View>

        <AsyncBoundary loading={posts === null} error={posts === null ? error : null} onRetry={() => void load()} skeleton={<MemesSkeleton />}>
          <FlatList
            data={posts && posts.filter((p) => !deleting({ targetType: 'image', id: p.id }))}
            keyExtractor={(p) => p.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            onScroll={onScroll}
            scrollEventThrottle={64}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.textSecondary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <EmptyState
                title={t('memes.empty')}
                action={{ label: t('post.open'), onPress: compose }}
              />
            }
            ListFooterComponent={loadingMore ? <Loading style={{ marginVertical: spacing.md }} /> : null}
          />
        </AsyncBoundary>

        {/* At the end of the line, which is the left in Soranî and Arabic. */}
        <View style={[styles.fab, dir.row === 'row-reverse' ? styles.fabLeft : styles.fabRight, { bottom: spacing.xl }]}>
          <ClayButton label={t('memes.post')} icon="plus" tone="primary" onPress={compose} />
        </View>
      </View>
    </GradientBackground>
  );
}

/** The list while it loads: the same cards — who and when, the square picture, the counts. */
function MemesSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.list} accessibilityLabel={t('common.loading')}>
      {[0, 1].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.glassFill }]}>
          <View style={styles.cardHead}>
            <Skeleton width={28} height={28} radius={radii.pill} />
            <SkeletonText size={typography.sizes.sm} width={28} />
          </View>
          <View style={styles.image}>
            <Skeleton height="100%" radius={radii.md} />
          </View>
          <View style={styles.cardFoot}>
            <SkeletonText size={typography.sizes.sm} width={40} />
            <SkeletonText size={typography.sizes.sm} width={36} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** A picture's own name in the list. */
const postId = (post: ImagePost): string => post.id;

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: layout.gutter },
  filters: { gap: spacing.sm, marginBottom: spacing.md },
  list: { paddingBottom: 120, gap: spacing.md },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  age: { fontSize: typography.sizes.sm },
  image: { width: '100%', aspectRatio: 1, borderRadius: radii.md },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: typography.sizes.md },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stat: { fontSize: typography.sizes.sm },
  fab: { position: 'absolute' },
  fabRight: { right: spacing.lg },
  fabLeft: { left: spacing.lg },
});
