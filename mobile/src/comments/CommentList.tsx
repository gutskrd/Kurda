import type { ReactNode } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { MIN_TOUCH_TARGET, decorative } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { noticeTime } from '../notifications/inbox';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { EmptyState } from '../theme/EmptyState';
import { Icon } from '../theme/Icon';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { authorOf, type ThreadComment } from './thread';
import type { CommentThread } from './useCommentThread';

/**
 * A post's comments, one level of replies under each, and the composer that
 * writes both — the half of the website's thread (web/src/library/Comments)
 * the phone was missing: who wrote each comment, when, and a way to answer
 * it or take your own back.
 *
 * Replies are drawn one step in, however deep they go: on a phone a second
 * and third indent leave a column too narrow to read. Each branch loads when
 * it is opened, as on the website, so a long thread is not fetched whole to
 * show its first few lines.
 */
export function CommentList({
  thread,
  onReport,
  renderAudio,
}: {
  thread: CommentThread;
  /** somebody else's comment, to the page's own report sheet */
  onReport: (c: ThreadComment) => void;
  /** a voice comment's player (library comments only, so pictures need not load the audio module) */
  renderAudio?: (url: string) => ReactNode;
}): React.JSX.Element {
  const { t } = useI18n();
  const { top, replies } = thread.state;
  if (top === null) return <CommentsSkeleton />;
  if (top.length === 0) return <EmptyState title={t('comments.empty')} />;

  // a reply's own replies sit beside it, under the same comment, one step in
  const branch = (id: string): React.JSX.Element[] =>
    (replies[id] ?? []).flatMap((r) => [
      <CommentRow key={r.id} comment={r} nested thread={thread} onReport={onReport} renderAudio={renderAudio} />,
      ...branch(r.id),
    ]);

  return (
    <View>
      {top.map((c) => (
        <View key={c.id}>
          <CommentRow comment={c} thread={thread} onReport={onReport} renderAudio={renderAudio} />
          {replies[c.id] ? <View style={styles.replies}>{branch(c.id)}</View> : null}
        </View>
      ))}
    </View>
  );
}

const AVATAR = 32;
const REPLY_AVATAR = 24;

function CommentRow({
  comment: c,
  nested = false,
  thread,
  onReport,
  renderAudio,
}: {
  comment: ThreadComment;
  nested?: boolean;
  thread: CommentThread;
  onReport: (c: ThreadComment) => void;
  renderAudio?: (url: string) => ReactNode;
}): React.JSX.Element {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const navigation = useNavigation<RootNavigation>();
  const author = authorOf(c, user);
  const removed = c.status === 'removed';
  const mine = c.authorId === user?.id;
  const size = nested ? REPLY_AVATAR : AVATAR;
  const loading = thread.loadingReplies.includes(c.id);

  // your own name opens your own profile tab, not the page others see you on
  const openProfile = () =>
    mine ? navigation.navigate('Tabs', { screen: 'Profile' }) : navigation.navigate('UserProfile', { userId: author.id });

  const audio = !removed && c.audioUrl && renderAudio ? renderAudio(c.audioUrl) : null;
  const text = removed ? t('comments.removed') : (c.body ?? (c.audioMediaId || c.audioUrl ? t('comments.voice') : ''));

  return (
    <View style={[styles.comment, c.pending ? styles.pending : null]}>
      {/* the picture opens them too, for a thumb; a screen reader is offered the name alone, not the same button twice */}
      <Pressable onPress={openProfile} disabled={c.pending} hitSlop={(MIN_TOUCH_TARGET - size) / 2} {...decorative()}>
        <InitialsAvatar name={author.username} id={author.id} size={size} photoUrl={author.avatarUrl} />
      </Pressable>
      <View style={styles.main}>
        <View style={styles.byline}>
          <Pressable
            onPress={openProfile}
            disabled={c.pending}
            hitSlop={BYLINE_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('friends.openProfile', { username: author.username })}
            style={styles.who}
          >
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
              {author.username}
            </Text>
          </Pressable>
          <Text style={[styles.age, { color: colors.textSecondary }]} numberOfLines={1}>
            {c.pending ? t('comments.posting') : noticeTime(c.createdAt, t, locale)}
          </Text>
        </View>
        {audio}
        {!audio || c.body ? (
          <Text style={[styles.body, { color: removed ? colors.textSecondary : colors.textPrimary }]}>{text}</Text>
        ) : null}

        {/* nothing to answer or take back until the server has it */}
        {!c.pending && !removed ? (
          <View style={styles.actions}>
            <Pressable onPress={() => thread.reply(c)} hitSlop={ACTION_SLOP} accessibilityRole="button" style={styles.action}>
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>{t('comments.reply')}</Text>
            </Pressable>
            {mine ? (
              <Pressable onPress={() => thread.confirmDelete(c)} hitSlop={ACTION_SLOP} accessibilityRole="button" style={styles.action}>
                <Text style={[styles.actionText, { color: colors.danger }]}>{t('common.delete')}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => onReport(c)}
                hitSlop={ACTION_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('moderation.reportComment')}
                style={styles.action}
              >
                <Icon name="flag" size={12} color={colors.textSecondary} />
                <Text style={[styles.actionText, { color: colors.textSecondary }]}>{t('moderation.report')}</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        {c.replyCount > 0 && !thread.state.replies[c.id] ? (
          <Pressable
            onPress={() => void thread.showReplies(c.id)}
            disabled={loading}
            hitSlop={ACTION_SLOP}
            accessibilityRole="button"
            accessibilityState={{ busy: loading }}
            style={styles.more}
          >
            <View style={[styles.moreRule, { backgroundColor: colors.separator }]} />
            <Text style={[styles.actionText, { color: colors.textSecondary }]}>
              {loading
                ? t('common.loading')
                : c.replyCount === 1
                  ? t('comments.showOneReply')
                  : t('comments.showReplies', { count: c.replyCount })}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Where a comment or a reply is written, kept above the keyboard by the
 * page's KeyboardAvoidingView and above the home indicator when it is down.
 * While replying it says to whom, with an ✕ to go back to commenting on the
 * post. `children` sits above the field (the library's voice recorder).
 */
export function CommentComposer({
  thread,
  value,
  onChangeText,
  onSubmit,
  ready,
  placeholder,
  maxLength,
  children,
}: {
  thread: CommentThread;
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  /** there is something to send */
  ready: boolean;
  placeholder: string;
  maxLength: number;
  children?: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const bottom = useScreenBottomInset(spacing.md);
  const target = thread.replyingTo;
  return (
    <View style={[styles.composerWrap, { paddingBottom: bottom }]}>
      {target ? (
        <View style={styles.replying}>
          <Text style={[styles.replyingText, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('comments.replyingTo', { name: target.name })}
          </Text>
          <Pressable
            onPress={thread.cancelReply}
            hitSlop={(MIN_TOUCH_TARGET - 24) / 2}
            accessibilityRole="button"
            accessibilityLabel={t('comments.cancelReply')}
            style={styles.cancel}
          >
            <Icon name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}
      {children}
      <View style={[styles.composer, { backgroundColor: colors.glassFill }]}>
        <TextInput
          ref={thread.inputRef}
          style={[styles.input, { color: colors.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={target ? t('comments.replyingTo', { name: target.name }) : placeholder}
          value={value}
          onChangeText={onChangeText}
          multiline
          maxLength={maxLength}
        />
        <Pressable
          onPress={onSubmit}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel={t('comments.post')}
          accessibilityState={{ disabled: !ready }}
          style={[styles.send, { opacity: ready ? 1 : 0.4 }]}
        >
          <Icon name="chevron-right" size={24} tone="primary" />
        </Pressable>
      </View>
    </View>
  );
}

/** Three comments in grey, laid out as the real ones are: the picture, who and when, what they said. */
export function CommentsSkeleton(): React.JSX.Element {
  return (
    <View>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.comment}>
          <Skeleton width={AVATAR} height={AVATAR} radius={radii.pill} />
          <View style={styles.main}>
            <SkeletonText size={typography.sizes.sm} width={i === 1 ? 72 : 96} />
            <SkeletonText size={typography.sizes.md} width={i === 1 ? '54%' : '80%'} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** a line of small text is about 20pt tall; this takes its touch area to 44 */
const ACTION_SLOP = { top: 12, bottom: 12, left: 8, right: 8 };
const BYLINE_SLOP = { top: 12, bottom: 12, left: 4, right: 4 };

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm },
  pending: { opacity: 0.6 },
  main: { flex: 1, gap: 2 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { flexShrink: 1 },
  name: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  age: { fontSize: typography.sizes.xs },
  body: { fontSize: typography.sizes.md },
  actions: { flexDirection: 'row', gap: spacing.md, paddingTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  more: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm, alignSelf: 'flex-start' },
  moreRule: { width: 24, height: StyleSheet.hairlineWidth },
  // under the words of the comment they answer, not under its picture
  replies: { marginLeft: AVATAR + spacing.sm },
  composerWrap: { gap: spacing.sm, paddingTop: spacing.sm },
  replying: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  replyingText: { flex: 1, fontSize: typography.sizes.sm },
  cancel: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderRadius: radii.lg, paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: 2 },
  input: { minHeight: MIN_TOUCH_TARGET, flex: 1, fontSize: typography.sizes.md, maxHeight: 120, paddingVertical: spacing.sm },
  send: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
