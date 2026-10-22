import { useCallback, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { AudioPlayer } from './AudioPlayer';
import { addComment, getPost } from './api';
import { ReportSheet, type ReportTarget } from '../reports/ReportSheet';
import { uploadVoiceNote } from './voiceUpload';
import { VoiceRecorder } from './VoiceRecorder';
import type { LibraryPost } from './types';
import { useI18n } from '../i18n/I18nContext';
import { PostMenuButton, SourceCredit, postImages } from '../composer/PostExtras';
import { PostPictures } from '../composer/PostPictures';
import { onPostSaved } from '../composer/postSaved';
import { CommentComposer, CommentList, CommentsSkeleton } from '../comments/CommentList';
import { useCommentThread } from '../comments/useCommentThread';

/**
 * Read a library post (KUR-284): title + body, an inline audio player when it has
 * a narration ("listen"), and a comment thread with a composer.
 */
export function LibraryPostScreen({ postId, onExit }: { postId: string; onExit: () => void }): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  // what is being reported, and whose it is (the Hevalo team's own posts offer no block)
  const [reporting, setReporting] = useState<{ target: ReportTarget; authorId: string | null; name?: string } | null>(null);

  const [post, setPost] = useState<LibraryPost | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [voiceUri, setVoiceUri] = useState<string | null>(null);

  const countBy = useCallback(
    (delta: number) => setPost((prev) => (prev ? { ...prev, commentCount: Math.max(0, prev.commentCount + delta) } : prev)),
    [],
  );
  const thread = useCommentThread('library', postId, countBy);
  const loadComments = thread.load;

  const loadAll = useCallback(async () => {
    setFailed(false);
    const [p] = await Promise.all([getPost(client, postId), loadComments()]);
    if (!p.ok) {
      setFailed(true);
      return;
    }
    setPost(p.data);
  }, [client, postId, loadComments]);

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
    const voice = voiceUri;
    if (!body && !voice) return;
    setDraft('');
    setVoiceUri(null);
    const sent = await thread.send({ body: body || null, audioUrl: voice }, async (parentId) => {
      // the voice note goes up first; the comment carries the id it comes back with
      let audioMediaId: string | undefined;
      if (voice) {
        const up = await uploadVoiceNote(client, { uri: voice }, t, locale);
        if (!up.ok) return { ok: false, title: t('library.voiceCommentFailed'), error: { message: up.error, limited: up.limited } };
        audioMediaId = up.audioMediaId;
      }
      const res = await addComment(client, postId, { body: body || undefined, audioMediaId, parentId });
      return res.ok ? { ok: true, comment: res.data } : { ok: false, title: t('comment.failed'), error: res.error };
    });
    // a refused comment goes back into the composer, so nothing written is lost
    if (!sent) {
      setDraft((current) => current || body);
      setVoiceUri((current) => current ?? voice);
    }
  }, [client, postId, draft, voiceUri, thread, t, locale]);

  const header = (
    <ScreenHeader
      title={t(post?.type === 'poem' ? 'library.kind.poem' : post?.type === 'gotin' ? 'civak.kind.saying' : 'library.kind.story')}
      onBack={onExit}
      right={post ? <PostMenuButton post={{ targetType: 'library', id: post.id, authorId: post.authorId }} onDeleted={onExit} /> : undefined}
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
      {/* the screen starts at the top of the window, so the keyboard needs no offset; Android draws edge to edge and resizes nothing itself */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {header}
        <View style={styles.screen}>
          {post === null ? (
            <PostSkeleton />
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
              <CommentList
                thread={thread}
                renderAudio={(url) => <AudioPlayer url={url} />}
                onReport={(c) =>
                  setReporting({
                    target: { type: 'library_comment', commentId: c.id },
                    authorId: c.authorRole === 'user' ? c.authorId : null,
                    name: c.author?.username,
                  })
                }
              />
            </ScrollView>
          )}

          <CommentComposer
            thread={thread}
            value={draft}
            onChangeText={setDraft}
            onSubmit={() => void submit()}
            ready={!!draft.trim() || !!voiceUri}
            placeholder={t(voiceUri ? 'library.notePlaceholder' : 'comments.add')}
            maxLength={10000}
          >
            <VoiceRecorder value={voiceUri} onChange={setVoiceUri} />
          </CommentComposer>
        </View>
      </KeyboardAvoidingView>
      {reporting ? (
        <ReportSheet
          visible
          target={reporting.target}
          blockable={reporting.authorId ? { userId: reporting.authorId, name: reporting.name ?? null } : null}
          onClose={() => setReporting(null)}
        />
      ) : null}
    </GradientBackground>
  );
}

/**
 * The page while it loads: the title, a page of the body at its own line
 * height, and the comments' heading — laid out by the page's own styles, so
 * the words arrive where the grey stood.
 */
function PostSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const widths = ['96%', '92%', '98%', '88%', '94%', '72%'] as const;
  return (
    <View style={styles.body} accessibilityLabel={t('common.loading')}>
      <SkeletonText size={typography.sizes.xl} lineHeight={TITLE_LINE} width="64%" />
      <View>
        {Array.from({ length: 12 }, (_, i) => (
          <SkeletonText key={i} size={typography.sizes.md} lineHeight={BODY_LINE} width={widths[i % widths.length]} />
        ))}
      </View>
      {/* "Report this post", under it on anybody else's */}
      <View>
        <Skeleton width={14} height={14} radius={radii.xs} />
        <SkeletonText size={typography.sizes.sm} width={112} />
      </View>
      <SkeletonText size={typography.sizes.sm} width={96} style={styles.commentsTitleSkeleton} />
      <CommentsSkeleton />
    </View>
  );
}

/** display(28) sets 1.12 */
const TITLE_LINE = Math.round(typography.sizes.xl * typography.displayLineHeight);
const BODY_LINE = 24;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: layout.gutter },
  body: { paddingBottom: spacing.xl, gap: spacing.md },
  title: { ...display(typography.sizes.xl) },
  postBody: { fontSize: typography.sizes.md, lineHeight: BODY_LINE },
  commentsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  commentsTitleSkeleton: { marginTop: spacing.sm },
  report: { fontSize: typography.sizes.sm },
});
