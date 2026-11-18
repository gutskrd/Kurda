import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Pressable } from '../theme/Pressable';
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
import { useCommentThread, type CommentDraft } from '../comments/useCommentThread';
import { heldDim } from '../theme/MotionParts';
import { useNavigation } from '@react-navigation/native';
import type { RootNavigation } from '../navigation/rootStack';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { noticeTime } from '../notifications/inbox';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useAccountGate } from '../auth/AccountGate';
import { getEngagement } from '../feed/api';
import { PostActions, usePostEngagement } from '../feed/FeedCard';
import type { FeedItem, PostEngagement } from '../feed/types';
import { formatNumber } from '../i18n/format';

const NO_ENGAGEMENT: PostEngagement = { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false };

/**
 * Read a written post: how often it was read, its title and body, an inline audio player when it has a narration, the
 * wall's row of like, comments, repost, share and save (counts from GET /posts/library/:id/engagement, as the website's
 * page reads them), and a comment thread with a composer.
 */
export function LibraryPostScreen({ postId, onExit }: { postId: string; onExit: () => void }): React.JSX.Element {
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  const dir = useDirection();
  // The side a line starts on: the right in Soranî and Arabic.
  const edge = dir.row === 'row-reverse' ? 'flex-end' : 'flex-start';
  // What is being reported, and whose it is (the Hevalo team's own posts offer no block).
  const [reporting, setReporting] = useState<{ target: ReportTarget; authorId: string | null; name?: string } | null>(null);

  const [post, setPost] = useState<LibraryPost | null>(null);
  const [engagement, setEngagement] = useState<PostEngagement | null>(null);
  const [failed, setFailed] = useState(false);
  const { require } = useAccountGate();
  const [draft, setDraft] = useState('');
  const [voiceUri, setVoiceUri] = useState<string | null>(null);

  const countBy = useCallback(
    (delta: number) => setPost((prev) => (prev ? { ...prev, commentCount: Math.max(0, prev.commentCount + delta) } : prev)),
    [],
  );
  // A comment cancelled, or refused on a retry: its words and voice note come back unless something new is there.
  const wordsBack = useCallback((back: CommentDraft) => {
    setDraft((now) => now || back.body || '');
    if (back.audioUrl) setVoiceUri((now) => now ?? back.audioUrl ?? null);
  }, []);
  const thread = useCommentThread('library', postId, countBy, wordsBack);
  const loadComments = thread.load;

  const loadAll = useCallback(async () => {
    setFailed(false);
    const [p, e] = await Promise.all([getPost(client, postId), getEngagement(client, { targetType: 'library', id: postId }), loadComments()]);
    if (!p.ok) {
      setFailed(true);
      return;
    }
    setPost(p.data);
    // Numbers that did not come are shown as none rather than holding the post back.
    setEngagement(e.ok && e.data.engagement ? e.data.engagement : NO_ENGAGEMENT);
  }, [client, postId, loadComments]);

  // The post in the wall's shape, so its row of actions is the wall's own.
  const item = useMemo(() => (post ? asFeedItem(post, engagement ?? NO_ENGAGEMENT) : null), [post, engagement]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // An edit in the composer shows once saved, and only then, since each read of the post counts a view.
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
      // The voice note goes up first; the comment carries the id it comes back with.
      let audioMediaId: string | undefined;
      if (voice) {
        const up = await uploadVoiceNote(client, { uri: voice }, t, locale);
        if (!up.ok) return { ok: false, title: t('library.voiceCommentFailed'), error: { message: up.error, limited: up.limited } };
        audioMediaId = up.audioMediaId;
      }
      const res = await addComment(client, postId, { body: body || undefined, audioMediaId, parentId });
      return res.ok ? { ok: true, comment: res.data } : { ok: false, title: t('comment.failed'), error: res.error };
    });
    // A refused comment goes back into the composer, so nothing written is lost.
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
      {/* The screen starts at the window's top, so the keyboard needs no offset; Android draws edge to edge and resizes nothing itself. */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {header}
        <View style={styles.screen}>
          {post === null ? (
            <PostSkeleton />
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <View style={[styles.reads, { flexDirection: dir.row, alignSelf: edge }]}>
                <Icon name="eye" size={14} color={colors.textSecondary} />
                <Text style={[styles.readsText, { color: colors.textSecondary }]}>
                  {t(post.viewCount === 1 ? 'library.readOne' : 'library.reads', { count: formatNumber(post.viewCount, locale) })}
                </Text>
              </View>
              {/* A gotin has no title; its pictures come first on its own page, words under them. */}
              {post.title ? <Text style={[styles.title, dir.free, { color: colors.textPrimary }]}>{post.title}</Text> : null}
              {/* Who wrote it and when, as the wall says it: a tap opens their profile. */}
              {post.author ? (
                <Pressable
                  onPress={() => post.author && navigation.navigate('UserProfile', { userId: post.author.id })}
                  accessibilityRole="button"
                  accessibilityLabel={t('friends.openProfile', { username: post.author.username })}
                  testID="library-post-author"
                  style={({ pressed }) => [styles.byline, { flexDirection: dir.row, alignSelf: edge }, pressed && heldDim]}
                >
                  <InitialsAvatar name={post.author.username} id={post.author.id} size={BYLINE_FACE} photoUrl={post.author.avatarUrl} />
                  <Text style={[styles.author, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
                    {post.author.username}
                  </Text>
                  <Text style={[styles.when, { color: colors.textSecondary }]} numberOfLines={1}>
                    {noticeTime(post.publishedAt ?? post.createdAt, t, locale)}
                  </Text>
                </Pressable>
              ) : null}
              <PostPictures images={postImages(post)} />
              {post.audioUrl ? <AudioPlayer url={post.audioUrl} /> : null}
              {post.body ? <Text style={[styles.postBody, dir.free, { color: colors.textPrimary }]}>{post.body}</Text> : null}
              {post.sourceCredit ? <SourceCredit text={post.sourceCredit} /> : null}
              {item ? (
                <View style={styles.actions}>
                  <PostRow item={item} onChanged={(next) => setEngagement(next.engagement)} onComment={() => require('comment') && thread.inputRef.current?.focus()} />
                </View>
              ) : null}
              {post.authorId !== user?.id ? (
                <Pressable
                  onPress={() =>
                    setReporting({
                      target: { type: 'library_post', postId: post.id },
                      authorId: post.authorRole === 'user' ? post.authorId : null,
                    })
                  }
                  // A single line of small text alone: it answers over 48 of height and a little past its ends.
                  reach="open"
                  reachSize={REPORT_LINE}
                  accessibilityRole="button"
                  accessibilityLabel={t('moderation.reportPost')}
                  // The flag beside its words, on one line, at the reading edge.
                  style={({ pressed }) => [styles.reportRow, { flexDirection: dir.row, alignSelf: edge }, pressed && heldDim]}
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

/** The wall's row under the post, its taps shown at once (feed/FeedCard `usePostEngagement`). */
function PostRow({ item, onChanged, onComment }: { item: FeedItem; onChanged: (next: FeedItem) => void; onComment: () => void }): React.JSX.Element {
  const engage = usePostEngagement(item, onChanged);
  return <PostActions item={item} engage={engage} onComment={onComment} />;
}

/** A written post in the wall's own shape. */
function asFeedItem(post: LibraryPost, engagement: PostEngagement): FeedItem {
  const images = postImages(post);
  return {
    key: `library:${post.id}`,
    targetType: 'library',
    id: post.id,
    kind: post.meme ? 'meme' : post.type,
    author: { id: post.author?.id ?? post.authorId, username: post.author?.username ?? '', displayName: null, avatarUrl: post.author?.avatarUrl ?? null },
    title: post.title,
    excerpt: post.body || null,
    imageUrl: images[0]?.url ?? null,
    images,
    meme: post.meme,
    href: `/app/library/${post.id}`,
    viewCount: post.viewCount,
    commentCount: post.commentCount,
    engagement,
    at: post.publishedAt ?? post.createdAt,
  };
}

/**
 * The loading placeholder: title, a page of body at its line height and the comments heading, using the page's
 * own styles so text lands where the grey stood.
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
      {/* "Report this post", under it on anybody else's. */}
      <View>
        <Skeleton width={14} height={14} radius={radii.xs} />
        <SkeletonText size={typography.sizes.sm} width={112} />
      </View>
      <SkeletonText size={typography.sizes.sm} width={96} style={styles.commentsTitleSkeleton} />
      <CommentsSkeleton />
    </View>
  );
}

/** display(28) sets 1.12. */
const TITLE_LINE = Math.round(typography.sizes.xl * typography.displayLineHeight);
const BODY_LINE = 24;

/** The face in the byline: as big as the wall's. */
const BYLINE_FACE = 28;

/** "Report this post" is drawn one line of the small words tall, about this. */
const REPORT_LINE = { height: 20 };

const styles = StyleSheet.create({
  flex: { flex: 1 },
  byline: { alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  author: { flexShrink: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  when: { fontSize: typography.sizes.sm },
  reportRow: { alignItems: 'center', gap: spacing.xs },
  reads: { alignItems: 'center', gap: spacing.xs },
  readsText: { fontSize: typography.sizes.sm },
  // The row runs to the page's edges as on the wall, whose pills keep their own gutter.
  actions: { marginHorizontal: -layout.gutter },
  screen: { flex: 1, paddingHorizontal: layout.gutter },
  body: { paddingBottom: spacing.xl, gap: spacing.md },
  title: { ...display(typography.sizes.xl) },
  postBody: { fontSize: typography.sizes.md, lineHeight: BODY_LINE },
  commentsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  commentsTitleSkeleton: { marginTop: spacing.sm },
  report: { fontSize: typography.sizes.sm },
});
