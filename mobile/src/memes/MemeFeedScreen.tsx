import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
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
import { onPostDeleted } from '../composer/postDeleted';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState } from '../theme/EmptyState';
import { Skeleton, SkeletonText } from '../theme/Skeleton';

const PAGE = 20;

/**
 * Meme/image feed (KUR-291). Browses published posts (filter meme/image, sort
 * newest/popular) and infinite-scrolls; posting opens the composer. Tapping a
 * post opens the post on a page of its own, with its likes and comments under it.
 */
export function MemeFeedScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();

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

  // reload whenever the filters change or the screen refocuses
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const res = await listPosts(client, { category, sort, limit: PAGE, offset: 0 });
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
    }, [client, category, sort]),
  );

  // a picture deleted on its own page is gone from here before the list reloads
  useEffect(
    () =>
      onPostDeleted((gone) => {
        if (gone.targetType === 'image') setPosts((prev) => prev && prev.filter((p) => p.id !== gone.id));
      }),
    [],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const loadMore = useCallback(async () => {
    if (loadingMore || end || !posts) return;
    setLoadingMore(true);
    await load({ append: true });
    setLoadingMore(false);
  }, [load, loadingMore, end, posts]);

  /**
   * Posting here opens the one composer, as everywhere else: words first, and a
   * picture whenever it is wanted. What is posted from the memes is a meme once
   * a picture is in it.
   */
  const compose = useCallback(() => navigation.navigate('Compose', { meme: true }), [navigation]);

  // the first screenful rises in once, as the list arrives
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
          <View style={styles.cardHead}>
            <InitialsAvatar name={item.authorId.slice(0, 2)} id={item.authorId} size={28} />
            <Text style={[styles.age, { color: colors.textSecondary }]}>{noticeTime(item.createdAt, t, locale)}</Text>
          </View>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
          ) : (
            <View style={[styles.image, styles.imageFallback, { backgroundColor: colors.controlTrack }]}>
              <Text style={{ color: colors.textSecondary }}>{t('memes.imageUnavailable')}</Text>
            </View>
          )}
          {item.caption ? <Text style={[styles.caption, { color: colors.textPrimary }]}>{item.caption}</Text> : null}
          {/* a heart is the one reaction there is, counted on the post itself; here, how many have said something */}
          {item.commentCount > 0 ? (
            <View style={styles.cardFoot}>
              <Icon name="chat" size={16} color={colors.textSecondary} />
              <Text style={[styles.stat, { color: colors.textSecondary }]}>{item.commentCount}</Text>
            </View>
          ) : null}
        </PressableScale>
      </Rise>
    ),
    [navigation, colors, entering, t, locale],
  );

  return (
    <GradientBackground>
      <ScreenHeader title={t('memes.title')} onBack={onExit} />
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
            data={posts}
            keyExtractor={(p) => p.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={
              <EmptyState
                title={t('memes.empty')}
                action={{ label: t('post.open'), onPress: compose }}
              />
            }
            ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null}
          />
        </AsyncBoundary>

        <View style={[styles.fab, { bottom: spacing.xl }]}>
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

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: layout.gutter },
  filters: { gap: spacing.sm, marginBottom: spacing.md },
  list: { paddingBottom: 120, gap: spacing.md },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  age: { fontSize: typography.sizes.sm },
  image: { width: '100%', aspectRatio: 1, borderRadius: radii.md },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: typography.sizes.md },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stat: { fontSize: typography.sizes.sm },
  fab: { position: 'absolute', right: spacing.lg },
});
