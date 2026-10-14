import { useCallback, useEffect, useState } from 'react';
import {
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
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { display } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonLines, SkeletonList } from '../theme/Skeleton';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { AudioPlayer } from './AudioPlayer';
import { addComment, getPost, listComments } from './api';
import { ReportSheet, type ReportTarget } from '../reports/ReportSheet';
import { useSendErrorAlert } from '../reports/SendError';
import { uploadVoiceNote } from './voiceUpload';
import { VoiceRecorder } from './VoiceRecorder';
import { commentText, type LibraryComment, type LibraryPost } from './types';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState } from '../theme/EmptyState';
import { EditPostButton, SourceCredit, postImages } from '../composer/PostExtras';
import { PostPictures } from '../composer/PostPictures';
import { onPostSaved } from '../composer/postSaved';

/**
 * Read a library post (KUR-284): title + body, an inline audio player when it has
 * a narration ("listen"), and a comment thread with a composer.
 */
export function LibraryPostScreen({ postId, onExit }: { postId: string; onExit: () => void }): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const topInset = useScreenTopInset();
  const showSendError = useSendErrorAlert();
  // what is being reported, and whose it is (the Hevalo team's own posts offer no block)
  const [reporting, setReporting] = useState<{ target: ReportTarget; authorId: string | null } | null>(null);

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

  // an edit made in the composer shows as soon as it is saved — and only
  // then, since each read of the post counts a view
  useEffect(
    () =>
      onPostSaved((saved) => {
        if (saved.id === postId) void loadAll();
      }),
    [postId, loadAll],
  );

  const submit = useCallback(async () => {
    const body = draft.trim();
    if ((!body && !voiceUri) || posting) return;
    setPosting(true);
    let audioMediaId: string | undefined;
    if (voiceUri) {
      const up = await uploadVoiceNote(client, { uri: voiceUri }, t, locale);
      if (!up.ok) {
        setPosting(false);
        showSendError(t('library.voiceCommentFailed'), { message: up.error, limited: up.limited });
        return;
      }
      audioMediaId = up.audioMediaId;
    }
    const res = await addComment(client, postId, { body: body || undefined, audioMediaId });
    setPosting(false);
    if (!res.ok) {
      showSendError(t('comment.failed'), res.error);
      return;
    }
    setDraft('');
    setVoiceUri(null);
    setComments((prev) => (prev ? [res.data, ...prev] : [res.data]));
    setPost((prev) => (prev ? { ...prev, commentCount: prev.commentCount + 1 } : prev));
  }, [client, postId, draft, voiceUri, posting, showSendError, t, locale]);

  const header = (
    <ScreenHeader
      title={t(post?.type === 'poem' ? 'library.kind.poem' : post?.type === 'gotin' ? 'civak.kind.saying' : 'library.kind.story')}
      onBack={onExit}
      right={post ? <EditPostButton post={post} /> : undefined}
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
              {/* a gotin has no title; its pictures come first on its own page, words under them */}
              {post.title ? <Text style={[styles.title, { color: colors.textPrimary }]}>{post.title}</Text> : null}
              <PostPictures images={postImages(post)} />
              {post.audioUrl ? <AudioPlayer url={post.audioUrl} /> : null}
              {post.body ? <Text style={[styles.postBody, { color: colors.textPrimary }]}>{post.body}</Text> : null}
              {post.sourceCredit ? <SourceCredit text={post.sourceCredit} /> : null}
              {post.authorId !== user?.id ? (
                <Pressable
                  onPress={() =>
                    setReporting({
                      target: { type: 'library_post', postId: post.id },
                      authorId: post.authorRole === 'user' ? post.authorId : null,
                    })
                  }
                  hitSlop={13}
                  accessibilityRole="button"
                  accessibilityLabel={t('moderation.reportPost')}
                >
                  <Icon name="flag" size={14} color={colors.textSecondary} />
                  <Text style={[styles.report, { color: colors.textSecondary }]}>{t('moderation.reportPost')}</Text>
                </Pressable>
              ) : null}

              <Text style={[styles.commentsTitle, { color: colors.textSecondary }]}>
                {post.commentCount === 1 ? t('composer.commentOne') : t('feed.comments', { count: post.commentCount })}
              </Text>
              {comments === null ? (
                <SkeletonList count={3} style={{ marginTop: spacing.xs }} />
              ) : comments.length === 0 ? (
                <EmptyState title={t('comments.empty')} />
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={styles.comment}>
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
                        {c.status !== 'removed' && c.authorId !== user?.id ? (
                          <Pressable
                            onPress={() =>
                              setReporting({
                                target: { type: 'library_comment', commentId: c.id },
                                authorId: c.authorRole === 'user' ? c.authorId : null,
                              })
                            }
                            hitSlop={13} accessibilityRole="button" accessibilityLabel={t('moderation.reportComment')}>
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
            <View style={[styles.composer, { backgroundColor: colors.glassFill }]}>
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
      {reporting ? (
        <ReportSheet
          visible
          target={reporting.target}
          blockable={reporting.authorId ? { userId: reporting.authorId, name: null } : null}
          onClose={() => setReporting(null)}
        />
      ) : null}
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
  comment: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  commentMain: { flex: 1, gap: 2 },
  commentBody: { fontSize: typography.sizes.md },
  commentFoot: { flexDirection: 'row', gap: spacing.md },
  replyHint: { fontSize: typography.sizes.xs },
  report: { fontSize: typography.sizes.sm },
  composerWrap: { gap: spacing.sm, marginBottom: spacing.md },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderRadius: radii.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  input: { minHeight: MIN_TOUCH_TARGET, flex: 1, fontSize: typography.sizes.md, maxHeight: 120 },
});
