import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { AudioPlayer } from './AudioPlayer';
import { confirmReport } from '../moderation/report';
import { addComment, getPost, listComments, reportComment, reportPost } from './api';
import { commentText, type LibraryComment, type LibraryPost } from './types';

/**
 * Read a library post (KUR-284): title + body, an inline audio player when it has
 * a narration ("listen"), and a comment thread with a composer.
 */
export function LibraryPostScreen({ postId, onExit }: { postId: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const topInset = useScreenTopInset();

  const [post, setPost] = useState<LibraryPost | null>(null);
  const [comments, setComments] = useState<LibraryComment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const loadAll = useCallback(async () => {
    setFailed(false);
    const [p, c] = await Promise.all([getPost(client, postId), listComments(client, postId, { sort: 'newest' })]);
    if (!p.ok) {
      setFailed(true);
      return;
    }
    setPost(p.data);
    if (c.ok) setComments(c.data.comments);
  }, [client, postId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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

  const header = (
    <View style={styles.titleRow}>
      <Pressable onPress={onExit} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back">
        <Icon name="chevron-left" size={24} color={colors.textSecondary} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.primary }]}>{post?.type === 'poem' ? 'Poem' : 'Story'}</Text>
      <View style={{ width: 24 }} />
    </View>
  );

  if (failed && !post) {
    return (
      <GradientBackground>
        <View style={[styles.screen, { paddingTop: topInset }]}>
          {header}
          <ErrorRetry onRetry={() => void loadAll()} />
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={topInset}>
        <View style={[styles.screen, { paddingTop: topInset }]}>
          {header}
          {post === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={[styles.title, { color: colors.textPrimary }]}>{post.title}</Text>
              {post.audioUrl ? <AudioPlayer url={post.audioUrl} /> : null}
              <Text style={[styles.postBody, { color: colors.textPrimary }]}>{post.body}</Text>
              <Pressable
                onPress={() => confirmReport('post', () => reportPost(client, post.id))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Report this post"
              >
                <Text style={[styles.report, { color: colors.textSecondary }]}>⚐ Report post</Text>
              </Pressable>

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
                      <Text style={[styles.commentBody, { color: c.status === 'removed' ? colors.textSecondary : colors.textPrimary }]}>
                        {commentText(c)}
                      </Text>
                      <View style={styles.commentFoot}>
                        {c.replyCount > 0 ? (
                          <Text style={[styles.replyHint, { color: colors.textSecondary }]}>
                            {c.replyCount} {c.replyCount === 1 ? 'reply' : 'replies'}
                          </Text>
                        ) : null}
                        {c.status !== 'removed' ? (
                          <Pressable onPress={() => confirmReport('comment', () => reportComment(client, c.id))} hitSlop={6} accessibilityRole="button" accessibilityLabel="Report this comment">
                            <Text style={[styles.replyHint, { color: colors.textSecondary }]}>⚐ Report</Text>
                          </Pressable>
                        ) : null}
                      </View>
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
              maxLength={10000}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  headerTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  body: { paddingBottom: spacing.xl, gap: spacing.md },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  postBody: { fontSize: typography.sizes.md, lineHeight: 24 },
  commentsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  empty: { textAlign: 'center', marginTop: spacing.md },
  comment: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  commentMain: { flex: 1, gap: 2 },
  commentBody: { fontSize: typography.sizes.md },
  commentFoot: { flexDirection: 'row', gap: spacing.md },
  replyHint: { fontSize: typography.sizes.xs },
  report: { fontSize: typography.sizes.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderWidth: 1, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md },
  input: { flex: 1, fontSize: typography.sizes.md, maxHeight: 120 },
});
