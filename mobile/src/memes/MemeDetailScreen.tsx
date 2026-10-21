import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ReportSheet, type ReportTarget } from '../reports/ReportSheet';
import { CommentComposer, CommentList, CommentsSkeleton } from '../comments/CommentList';
import { useCommentThread } from '../comments/useCommentThread';
import { FeedCard } from '../feed/FeedCard';
import { getEngagement } from '../feed/api';
import type { FeedItem, PostEngagement } from '../feed/types';
import { addComment, getPost } from './api';
import type { ImagePost } from './types';

const NO_ENGAGEMENT: PostEngagement = { likes: 0, bookmarks: 0, reposts: 0, liked: false, bookmarked: false, reposted: false };

/**
 * A picture post on a page of its own: the post exactly as it is on the wall
 * — whoever posted it and its "⋯", the picture from edge to edge, the heart
 * and the rest of the row with their counts, the caption and how long ago —
 * and its conversation under it, with a composer at the foot.
 *
 * A heart is the one reaction there is; the row of emoji this page had is
 * gone. Its numbers come from GET /posts/image/:id/engagement, so a post
 * opened from a link counts the same as one opened from the wall.
 */
export function MemeDetailScreen({ postId, onExit }: { postId: string; onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  // what is being reported, and whose it is (the Hevalo team's own posts offer no block)
  const [reporting, setReporting] = useState<{ target: ReportTarget; authorId: string | null; name?: string } | null>(null);

  const [post, setPost] = useState<ImagePost | null>(null);
  const [engagement, setEngagement] = useState<PostEngagement | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');

  const countBy = useCallback(
    (delta: number) => setPost((prev) => (prev ? { ...prev, commentCount: Math.max(0, prev.commentCount + delta) } : prev)),
    [],
  );
  const thread = useCommentThread('images', postId, countBy);
  const loadComments = thread.load;

  const loadAll = useCallback(async () => {
    setFailed(false);
    const [p, e] = await Promise.all([getPost(client, postId), getEngagement(client, { targetType: 'image', id: postId }), loadComments()]);
    if (!p.ok) {
      setFailed(true);
      return;
    }
    setPost(p.data);
    // numbers that did not come are shown as none rather than holding the picture back
    setEngagement(e.ok && e.data.engagement ? e.data.engagement : NO_ENGAGEMENT);
  }, [client, postId, loadComments]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const submit = useCallback(async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    const sent = await thread.send({ body }, async (parentId) => {
      const res = await addComment(client, postId, body, parentId);
      return res.ok ? { ok: true, comment: res.data } : { ok: false, title: t('comment.failed'), error: res.error };
    });
    // a refused comment goes back into the composer, so nothing written is lost
    if (!sent) setDraft((current) => current || body);
  }, [client, postId, draft, thread, t]);

  // the post as the wall shows it, so the page and the wall are one thing
  const item = useMemo(() => (post && engagement ? asFeedItem(post, engagement) : null), [post, engagement]);

  if (failed && !post) {
    return (
      <GradientBackground>
        <Header onExit={onExit} />
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
        <Header onExit={onExit} />
        <View style={styles.screen}>
          {post === null || item === null ? (
            <MemeSkeleton />
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <FeedCard item={item} standalone onDeleted={onExit} onChanged={(next) => setEngagement(next.engagement)} />
              <View style={styles.comments}>
                <Text style={[styles.commentsTitle, { color: colors.textSecondary }]}>
                  {post.commentCount === 1 ? t('composer.commentOne') : t('feed.comments', { count: post.commentCount })}
                </Text>
                <CommentList
                  thread={thread}
                  onReport={(c) =>
                    setReporting({
                      target: { type: 'image_comment', commentId: c.id },
                      authorId: c.authorRole === 'user' ? c.authorId : null,
                      name: c.author?.username,
                    })
                  }
                />
              </View>
            </ScrollView>
          )}

          <CommentComposer
            thread={thread}
            value={draft}
            onChangeText={setDraft}
            onSubmit={() => void submit()}
            ready={!!draft.trim()}
            placeholder={t('comments.add')}
            maxLength={2000}
          />
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

/** The page while it loads: the post's head, the square picture, its row, and the comments under it. */
function MemeSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={styles.body} accessibilityLabel={t('common.loading')}>
      <View style={styles.skeletonHead}>
        <Skeleton width={34} height={34} radius={radii.pill} />
        <SkeletonText size={typography.sizes.sm} width={120} />
      </View>
      <View style={styles.image}>
        <Skeleton height="100%" radius={0} />
      </View>
      <View style={styles.comments}>
        <SkeletonText size={typography.sizes.sm} width={96} style={styles.commentsTitleSkeleton} />
        <CommentsSkeleton />
      </View>
    </View>
  );
}

/** A picture post in the wall's own shape, so it can be drawn by the wall's own card. */
function asFeedItem(post: ImagePost, engagement: PostEngagement): FeedItem {
  return {
    key: `image:${post.id}`,
    targetType: 'image',
    id: post.id,
    kind: post.category,
    author: { id: post.author?.id ?? post.authorId, username: post.author?.username ?? '', displayName: null, avatarUrl: post.author?.avatarUrl ?? null },
    title: null,
    excerpt: post.caption,
    imageUrl: post.imageUrl,
    imageAlt: post.caption,
    images: post.imageUrl ? [{ url: post.imageUrl, alt: post.caption, width: null, height: null }] : [],
    href: `/app/dimen/${post.id}`,
    viewCount: post.viewCount,
    commentCount: post.commentCount,
    engagement,
    at: post.createdAt,
  };
}

function Header({ onExit, right }: { onExit: () => void; right?: React.ReactNode }): React.JSX.Element {
  const { t } = useI18n();
  return <ScreenHeader title={t('memes.post')} onBack={onExit} right={right} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1 },
  body: { paddingBottom: spacing.xl },
  // the picture runs to the edges, as on the wall; the conversation keeps the gutter
  image: { width: '100%', aspectRatio: 1 },
  skeletonHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter, paddingVertical: spacing.sm },
  comments: { paddingHorizontal: layout.gutter, gap: spacing.md },
  commentsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  commentsTitleSkeleton: { marginTop: spacing.sm },
});
