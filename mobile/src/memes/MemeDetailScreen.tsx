import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { describeError } from '../api/errors';
import { radii, spacing, typography } from '../theme/tokens';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { addComment, clearReaction, getPost, getReactions, listComments, setReaction } from './api';
import {
  commentText,
  relativeTime,
  REACTION_EMOJI,
  REACTION_ORDER,
  type Comment,
  type ImagePost,
  type Reaction,
  type ReactionSummary,
} from './types';

/**
 * Meme/image post detail (KUR-291): the full image, an emoji reaction bar (tap to
 * set/toggle), and a comment thread with a composer. Reactions + comments update
 * optimistically from the server's returned summary/rows.
 */
export function MemeDetailScreen({ postId, onExit }: { postId: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const topInset = useScreenTopInset();

  const [post, setPost] = useState<ImagePost | null>(null);
  const [reactions, setReactions] = useState<ReactionSummary | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const loadAll = useCallback(async () => {
    setFailed(false);
    const [p, r, c] = await Promise.all([
      getPost(client, postId),
      getReactions(client, postId),
      listComments(client, postId, { sort: 'newest' }),
    ]);
    if (!p.ok) {
      setFailed(true);
      return;
    }
    setPost(p.data);
    if (r.ok) setReactions(r.data);
    if (c.ok) setComments(c.data.comments);
  }, [client, postId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const react = useCallback(
    async (reaction: Reaction) => {
      if (!reactions) return;
      const isSame = reactions.mine === reaction;
      const res = isSame ? await clearReaction(client, postId) : await setReaction(client, postId, reaction);
      if (res.ok) setReactions(res.data);
    },
    [client, postId, reactions],
  );

  const submit = useCallback(async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    const res = await addComment(client, postId, body);
    setPosting(false);
    if (!res.ok) {
      Alert.alert('Couldn’t comment', describeError(res.error).message);
      return;
    }
    setDraft('');
    setComments((prev) => (prev ? [res.data, ...prev] : [res.data]));
    setPost((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
  }, [client, postId, draft, posting]);

  if (failed && !post) {
    return (
      <GradientBackground>
        <View style={[styles.screen, { paddingTop: topInset }]}>
          <Header colors={colors} onExit={onExit} />
          <ErrorRetry onRetry={() => void loadAll()} />
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={topInset}>
        <View style={[styles.screen, { paddingTop: topInset }]}>
          <Header colors={colors} onExit={onExit} />
          {post === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {post.imageUrl ? (
                <Image source={{ uri: post.imageUrl }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
              ) : null}
              {post.caption ? <Text style={[styles.caption, { color: colors.textPrimary }]}>{post.caption}</Text> : null}

              <View style={styles.reactionBar}>
                {REACTION_ORDER.map((r) => {
                  const active = reactions?.mine === r;
                  const n = reactions?.counts[r] ?? 0;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => void react(r)}
                      style={[
                        styles.reaction,
                        { borderColor: active ? colors.primary : colors.glassBorder, backgroundColor: active ? colors.primaryStrong : colors.glassFill },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`${r}${active ? ', selected' : ''}`}
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={styles.reactionEmoji}>{REACTION_EMOJI[r]}</Text>
                      {n > 0 ? <Text style={[styles.reactionCount, { color: active ? colors.textOnPrimary : colors.textSecondary }]}>{n}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.commentsTitle, { color: colors.textSecondary }]}>
                {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
              </Text>
              {comments === null ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
              ) : comments.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>No comments yet.</Text>
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={[styles.comment, { borderColor: colors.glassBorder }]}>
                    <InitialsAvatar name={c.authorId.slice(0, 2)} id={c.authorId} size={28} />
                    <View style={styles.commentMain}>
                      <Text style={[styles.commentAge, { color: colors.textSecondary }]}>{relativeTime(c.createdAt)}</Text>
                      <Text style={[styles.commentBody, { color: c.status === 'removed' ? colors.textSecondary : colors.textPrimary }]}>
                        {commentText(c)}
                      </Text>
                      {c.replyCount > 0 ? (
                        <Text style={[styles.replyHint, { color: colors.textSecondary }]}>
                          {c.replyCount} {c.replyCount === 1 ? 'reply' : 'replies'}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          <View style={[styles.composer, { borderColor: colors.glassBorder, backgroundColor: colors.glassFill }]}>
            <TextInput
              style={[styles.input, { color: colors.textPrimary }]}
              placeholder="Add a comment…"
              placeholderTextColor={colors.textSecondary}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
            />
            <Pressable
              onPress={() => void submit()}
              disabled={!draft.trim() || posting}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Post comment"
              style={{ opacity: !draft.trim() || posting ? 0.4 : 1 }}
            >
              <Icon name="chevron-right" size={24} tone="primary" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

function Header({ colors, onExit }: { colors: ReturnType<typeof useTheme>['colors']; onExit: () => void }): React.JSX.Element {
  return (
    <View style={styles.titleRow}>
      <Pressable onPress={onExit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
        <Icon name="chevron-left" size={24} color={colors.textSecondary} />
      </Pressable>
      <Text style={[styles.title, { color: colors.primary }]}>Post</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  body: { paddingBottom: spacing.xl, gap: spacing.md },
  image: { width: '100%', aspectRatio: 1, borderRadius: radii.md, backgroundColor: '#0002' },
  caption: { fontSize: typography.sizes.md },
  reactionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  reactionEmoji: { fontSize: 18 },
  reactionCount: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  commentsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  empty: { textAlign: 'center', marginTop: spacing.md },
  comment: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  commentMain: { flex: 1, gap: 2 },
  commentAge: { fontSize: typography.sizes.xs },
  commentBody: { fontSize: typography.sizes.md },
  replyHint: { fontSize: typography.sizes.xs },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md },
  input: { flex: 1, fontSize: typography.sizes.md, maxHeight: 120 },
});
