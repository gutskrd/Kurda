import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { Pop } from '../theme/MotionParts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Skeleton, SkeletonText, lineOf } from '../theme/Skeleton';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ReportSheet, type ReportTarget } from '../reports/ReportSheet';
import { PostMenuButton } from '../composer/PostExtras';
import { CommentComposer, CommentList, CommentsSkeleton } from '../comments/CommentList';
import { useCommentThread } from '../comments/useCommentThread';
import { addComment, clearReaction, getPost, getReactions, setReaction } from './api';
import {
  REACTION_EMOJI,
  REACTION_LABEL,
  REACTION_ORDER,
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
  const { client, user } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  // what is being reported, and whose it is (the Hevalo team's own posts offer no block)
  const [reporting, setReporting] = useState<{ target: ReportTarget; authorId: string | null; name?: string } | null>(null);

  const [post, setPost] = useState<ImagePost | null>(null);
  const [reactions, setReactions] = useState<ReactionSummary | null>(null);
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
    const [p, r] = await Promise.all([getPost(client, postId), getReactions(client, postId), loadComments()]);
    if (!p.ok) {
      setFailed(true);
      return;
    }
    setPost(p.data);
    if (r.ok) setReactions(r.data);
  }, [client, postId, loadComments]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const react = useCallback(
    async (reaction: Reaction) => {
      if (!reactions) return;
      const isSame = reactions.mine === reaction;
      // choosing a reaction is felt; taking it back is quiet
      if (!isSame) haptic('tap');
      const res = isSame ? await clearReaction(client, postId) : await setReaction(client, postId, reaction);
      if (res.ok) setReactions(res.data);
    },
    [client, postId, reactions],
  );

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

  // your own picture's menu, once it has loaded and it is yours
  const menu = post ? <PostMenuButton post={{ targetType: 'image', id: post.id, authorId: post.authorId }} onDeleted={onExit} /> : undefined;

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
        <Header onExit={onExit} right={menu} />
        <View style={styles.screen}>
          {post === null ? (
            <MemeSkeleton />
          ) : (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              {post.imageUrl ? (
                <Image source={{ uri: post.imageUrl }} style={styles.image} resizeMode="contain" accessibilityIgnoresInvertColors />
              ) : null}
              {post.caption ? <Text style={[styles.caption, { color: colors.textPrimary }]}>{post.caption}</Text> : null}
              {post.authorId !== user?.id ? (
                <Pressable
                  onPress={() =>
                    setReporting({
                      target: { type: 'image_post', postId: post.id },
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
                      accessibilityLabel={t(REACTION_LABEL[r])}
                      accessibilityState={{ selected: active }}
                    >
                      {/* the one chosen pops as it becomes yours */}
                      <Pop when={active}>
                        <Text style={styles.reactionEmoji}>{REACTION_EMOJI[r]}</Text>
                      </Pop>
                      {n > 0 ? <Text style={[styles.reactionCount, { color: active ? colors.textOnPrimary : colors.textSecondary }]}>{n}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>

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

/** The page while it loads: the square picture, the reactions, the comments' heading and three comments. */
function MemeSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={styles.body} accessibilityLabel={t('common.loading')}>
      <View style={styles.image}>
        <Skeleton height="100%" radius={radii.md} />
      </View>
      <SkeletonText size={typography.sizes.md} width="58%" />
      {/* "Report this post", under it on anybody else's */}
      <View>
        <Skeleton width={14} height={14} radius={radii.xs} />
        <SkeletonText size={typography.sizes.sm} width={112} />
      </View>
      <View style={styles.reactionBar}>
        {REACTION_ORDER.map((r) => (
          <Skeleton key={r} width={REACTION_WIDTH} height={REACTION_HEIGHT} radius={radii.pill} />
        ))}
      </View>
      <SkeletonText size={typography.sizes.sm} width={96} style={styles.commentsTitleSkeleton} />
      <CommentsSkeleton />
    </View>
  );
}

/** a reaction: an emoji's line, 6 above and below, inside a hairline */
const REACTION_HEIGHT = lineOf(typography.sizes.lg) + 6 * 2 + 2;
const REACTION_WIDTH = lineOf(typography.sizes.lg) + spacing.sm * 2 + 2;

function Header({ onExit, right }: { onExit: () => void; right?: React.ReactNode }): React.JSX.Element {
  const { t } = useI18n();
  return <ScreenHeader title={t('memes.post')} onBack={onExit} right={right} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: layout.gutter },
  body: { paddingBottom: spacing.xl, gap: spacing.md },
  image: { width: '100%', aspectRatio: 1, borderRadius: radii.md, backgroundColor: '#0002' },
  caption: { fontSize: typography.sizes.md },
  reactionBar: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reaction: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  reactionEmoji: { fontSize: typography.sizes.lg },
  reactionCount: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  commentsTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: spacing.sm },
  commentsTitleSkeleton: { marginTop: spacing.sm },
  report: { fontSize: typography.sizes.sm },
});
