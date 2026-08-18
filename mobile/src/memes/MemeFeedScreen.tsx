import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { ClayButton, ErrorRetry, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { createPost, listPosts, uploadMemeImage } from './api';
import { relativeTime, REACTION_EMOJI, type Category, type ImagePost } from './types';

const PAGE = 20;

/**
 * Meme/image feed (KUR-291). Browses published posts (filter meme/image, sort
 * newest/popular), infinite-scrolls, and uploads a new post through the cost-safe
 * server pipeline (pick → /images/upload → create). Tapping a post opens the
 * detail screen with reactions + comments.
 */
export function MemeFeedScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const topInset = useScreenTopInset();

  const [category, setCategory] = useState<Category>('meme');
  const [sort, setSort] = useState<'newest' | 'popular'>('newest');
  const [posts, setPosts] = useState<ImagePost[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [end, setEnd] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(
    async (opts: { append?: boolean } = {}) => {
      const offset = opts.append && posts ? posts.length : 0;
      const res = await listPosts(client, { category, sort, limit: PAGE, offset });
      if (!res.ok) {
        if (!opts.append) setFailed(true);
        return;
      }
      setFailed(false);
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
          setFailed(false);
          setEnd(res.data.posts.length < PAGE);
          setPosts(res.data.posts);
        } else {
          setFailed(true);
        }
      })();
      return () => {
        active = false;
      };
    }, [client, category, sort]),
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

  const pickAndUpload = useCallback(async () => {
    if (uploading) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Photo access needed', 'Allow photo access in Settings to post an image.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    setUploading(true);
    const up = await uploadMemeImage(client, { uri: asset.uri, contentType: asset.mimeType ?? 'image/jpeg' });
    if (!up.ok) {
      setUploading(false);
      Alert.alert('Couldn’t upload', up.error);
      return;
    }
    const created = await createPost(client, { imageMediaId: up.imageMediaId, category });
    setUploading(false);
    if (!created.ok) {
      Alert.alert('Couldn’t post', 'Your image uploaded but the post failed. Please try again.');
      return;
    }
    setPosts((prev) => (prev ? [created.data, ...prev] : [created.data]));
  }, [client, category, uploading]);

  const renderItem = useCallback(
    ({ item }: { item: ImagePost }) => (
      <Pressable
        onPress={() => navigation.navigate('MemeDetail', { postId: item.id })}
        style={[styles.card, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}
        accessibilityRole="button"
        accessibilityLabel={`Open post${item.caption ? `: ${item.caption}` : ''}`}
      >
        <View style={styles.cardHead}>
          <InitialsAvatar name={item.authorId.slice(0, 2)} id={item.authorId} size={28} />
          <Text style={[styles.age, { color: colors.textSecondary }]}>{relativeTime(item.createdAt)}</Text>
        </View>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.image, styles.imageFallback, { backgroundColor: colors.controlTrack }]}>
            <Text style={{ color: colors.textSecondary }}>image unavailable</Text>
          </View>
        )}
        {item.caption ? <Text style={[styles.caption, { color: colors.textPrimary }]}>{item.caption}</Text> : null}
        <View style={styles.cardFoot}>
          <Text style={[styles.stat, { color: colors.textSecondary }]}>
            {REACTION_EMOJI.laugh} {item.reactionCount}
          </Text>
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
          <Text style={[styles.title, { color: colors.primary }]}>Memes</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.filters}>
          <Segmented options={['meme', 'image'] as const} value={category} onChange={setCategory} labelOf={(c) => (c === 'meme' ? 'Memes' : 'Images')} />
          <Segmented options={['newest', 'popular'] as const} value={sort} onChange={setSort} labelOf={(s) => (s === 'newest' ? 'Newest' : 'Popular')} />
        </View>

        {failed && !posts ? (
          <ErrorRetry onRetry={() => void load()} />
        ) : posts === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(p) => p.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>No posts yet — be the first!</Text>}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} /> : null}
          />
        )}

        <View style={[styles.fab, { bottom: spacing.xl }]}>
          <ClayButton label={uploading ? 'Uploading…' : '+ Post'} tone="primary" onPress={pickAndUpload} />
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
  card: { borderRadius: radii.lg, borderWidth: 1, padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  age: { fontSize: typography.sizes.sm },
  image: { width: '100%', aspectRatio: 1, borderRadius: radii.md },
  imageFallback: { alignItems: 'center', justifyContent: 'center' },
  caption: { fontSize: typography.sizes.md },
  cardFoot: { flexDirection: 'row', gap: spacing.lg },
  stat: { fontSize: typography.sizes.sm },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  fab: { position: 'absolute', right: spacing.lg },
});
