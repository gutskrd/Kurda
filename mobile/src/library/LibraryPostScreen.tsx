import { useCallback, useEffect, useState } from 'react';
import {
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
import { display } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonLines, SkeletonList } from '../theme/Skeleton';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { AudioPlayer } from './AudioPlayer';
import { confirmReport } from '../moderation/report';
import { addComment, getPost, listComments, reportComment, reportPost } from './api';
import { uploadVoiceNote } from './voiceUpload';
import { VoiceRecorder } from './VoiceRecorder';
import { commentText, type LibraryComment, type LibraryPost } from './types';
import { useI18n } from '../i18n/I18nContext';

/**
 * Read a library post (KUR-284): title + body, an inline audio player when it has
 * a narration ("listen"), and a comment thread with a composer.
 */
export function LibraryPostScreen({ postId, onExit }: { postId: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();

  const [post, setPost] = useState<LibraryPost | null>(null);
  const [comments, setComments] = useState<LibraryComment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [voiceUri, setVoiceUri] = useState<string | null>(null);
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
    if ((!body && !voiceUri) || posting) return;
    setPosting(true);
    let audioMediaId: string | undefined;
    if (voiceUri) {
      const up = await uploadVoiceNote(client, { uri: voiceUri }, t);
      if (!up.ok) {
        setPosting(false);
        Alert.alert(t('library.voiceCommentFailed'), up.error);
        return;
      }
      audioMediaId = up.audioMediaId;
    }
    const res = await addComment(client, postId, { body: body || undefined, audioMediaId });
    setPosting(false);
    if (!res.ok) {
      Alert.alert(t('comment.failed'), describeError(res.error, t));
      return;
    }
    setDraft('');
    setVoiceUri(null);
    setComments((prev) => (prev ? [res.data, ...prev] : [res.data]));
    setPost((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
  }, [client, postId, draft, voiceUri, posting]);

  const header = (
    <ScreenHeader
      title={t(post?.type === 'poem' ? 'library.kind.poem' : 'library.kind.story')}
      onBack={onExit}
    />
  );

  if (failed && !post) {
    return (
      <GradientBackground>
        {header}
        <View style={styles.screen}>
          <ErrorRetry onRetry={() => void loadAll()} />
        </View>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={topInset}>
        {header}
        <View style={styles.screen}>
          {post === null ? (
            <View style={styles.loading}>
              <Skeleton width="60%" height={24} />
              <SkeletonLines count={5} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={[styles.title, { color: colors.textPrimary }]}>{post.title}</Text>
              {post.audioUrl ? <AudioPlayer url={post.audioUrl} /> : null}
              <Text style={[styles.postBody, { color: colors.textPrimary }]}>{post.body}</Text>
              <Pressable
                onPress={() => confirmReport(t, 'post', () => reportPost(client, post.id))}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t('moderation.reportPost')}
              >
                <Icon name="flag" size={14} color={colors.textSecondary} />
                <Text style={[styles.report, { color: colors.textSecondary }]}>{t('moderation.reportPost')}</Text>
              </Pressable>

              <Text style={[styles.commentsTitle, { color: colors.textSecondary }]}>
                {post.commentCount} {post.commentCount === 1 ? 'comment' : 'comments'}
              </Text>
              {comments === null ? (
                <SkeletonList count={3} style={{ marginTop: spacing.xs }} />
              ) : comments.length === 0 ? (
                <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('comments.empty')}</Text>
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={[styles.comment, { borderColor: colors.glassBorder }]}>
                    <InitialsAvatar name={c.authorId.slice(0, 2)} id={c.authorId} size={28} />
                    <View style={styles.commentMain}>
                      {c.status !== 'removed' && c.audioUrl ? <AudioPlayer url={c.audioUrl} /> : null}
                      {c.body || c.status === 'removed' || !c.audioUrl ? (
                        <Text style={[styles.commentBody, { color: c.status === 'removed' ? colors.textSecondary : colors.textPrimary }]}>
                          {commentText(c, t)}
                        </Text>
                      ) : null}
                      <View style={styles.commentFoot}>
                        {c.replyCount > 0 ? (
                          <Text style={[styles.replyHint, { color: colors.textSecondary }]}>
                            {c.replyCount} {c.replyCount === 1 ? 'reply' : 'replies'}
                          </Text>
                        ) : null}
                        {c.status !== 'removed' ? (
                          <Pressable onPress={() => confirmReport(t, 'comment', () => reportComment(client, c.id))} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('moderation.reportComment')}>
                            <Icon name="flag" size={12} color={colors.textSecondary} />
                            <Text style={[styles.replyHint, { color: colors.textSecondary }]}>{t('moderation.report')}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          <View style={styles.composerWrap}>
            <VoiceRecorder value={voiceUri} onChange={setVoiceUri} />
            <View style={[styles.composer, { borderColor: colors.glassBorder, backgroundColor: colors.glassFill }]}>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                placeholder={t(voiceUri ? 'library.notePlaceholder' : 'comments.add')}
                placeholderTextColor={colors.textSecondary}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={10000}
              />
              <Pressable
                onPress={() => void submit()}
                disabled={(!draft.trim() && !voiceUri) || posting}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('comments.post')}
                style={{ opacity: (!draft.trim() && !voiceUri) || posting ? 0.4 : 1 }}
              >
                <Icon name="chevron-right" size={24} tone="primary" />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  body: { paddingBottom: spacing.xl, gap: spacing.md },
  loading: { padding: spacing.lg, gap: spacing.lg },
  title: { ...display(typography.sizes.xl) },
  postBody: { fontSize: typography.sizes.md, lineHeight: 24 },
  commentsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  empty: { textAlign: 'center', marginTop: spacing.md },
  comment: { flexDirection: 'row', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.sm },
  commentMain: { flex: 1, gap: 2 },
  commentBody: { fontSize: typography.sizes.md },
  commentFoot: { flexDirection: 'row', gap: spacing.md },
  replyHint: { fontSize: typography.sizes.xs },
  report: { fontSize: typography.sizes.sm },
  composerWrap: { gap: spacing.sm, marginBottom: spacing.md },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  input: { flex: 1, fontSize: typography.sizes.md, maxHeight: 120 },
});
