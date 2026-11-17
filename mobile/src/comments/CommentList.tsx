import type { ReactNode } from 'react';
import { useNavigation } from '@react-navigation/native';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { useAuth } from '../auth/AuthContext';
import { useAccountGate } from '../auth/AccountGate';
import { SendButton } from '../chat/SendButton';
import { MIN_TOUCH_TARGET, decorative, reachSlop } from '../a11y/a11y';
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
import { pressedDim } from '../theme/motion';
import { heldDim } from '../theme/MotionParts';
import { useDirection } from '../reports/direction';

/**
 * A post's comments with one level of replies and the composer for both, matching the web thread
 * (web/src/library/Comments): author, time, reply and delete-your-own. Replies are indented one step however deep
 * they go, since deeper indents are unreadable on a phone. Each branch loads when opened.
 */
export function CommentList({
  thread,
  onReport,
  renderAudio,
}: {
  thread: CommentThread;
  /** Somebody else's comment, to the page's own report sheet. */
  onReport: (c: ThreadComment) => void;
  /** A voice comment's player (library comments only, so pictures need not load the audio module). */
  renderAudio?: (url: string) => ReactNode;
}): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const { top, replies } = thread.state;
  if (top === null) return <CommentsSkeleton />;
  if (top.length === 0) return <EmptyState title={t('comments.empty')} />;

  // A reply's own replies sit beside it, under the same comment, one step in.
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
          {replies[c.id] ? <View style={dir.row === 'row-reverse' ? styles.repliesRight : styles.replies}>{branch(c.id)}</View> : null}
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
  // A guest may read a thread; answering in it is the account's.
  const { require } = useAccountGate();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  // In Soranî and Arabic a comment starts on the right; what somebody wrote keeps its own direction.
  const dir = useDirection();
  const edge = dir.row === 'row-reverse' ? 'flex-end' : 'flex-start';
  const navigation = useNavigation<RootNavigation>();
  const author = authorOf(c, user);
  const removed = c.status === 'removed';
  const mine = c.authorId === user?.id;
  const size = nested ? REPLY_AVATAR : AVATAR;
  const loading = thread.loadingReplies.includes(c.id);
  /*
   * The picture and the text beside it split the gap between them. A reply's picture sits just under its parent's
   * line, whose Reply reaches down to meet it, so it reaches up only half that gap. hitSlop uses physical left
   * and right, so the sides follow the row direction.
   */
  const mirrored = dir.row === 'row-reverse';
  const faceTop = nested ? SEAM : undefined;
  const faceSlop = reachSlop(size, size, { limit: mirrored ? { left: SEAM, top: faceTop } : { right: SEAM, top: faceTop } });
  const replySlop = mirrored ? { ...ACTION_SLOP, right: SEAM } : { ...ACTION_SLOP, left: SEAM };

  // Your own name opens your own profile tab, not the page others see you on.
  const openProfile = () =>
    mine ? navigation.navigate('Tabs', { screen: 'Profile' }) : navigation.navigate('UserProfile', { userId: author.id });

  const audio = !removed && c.audioUrl && renderAudio ? renderAudio(c.audioUrl) : null;
  const text = removed ? t('comments.removed') : (c.body ?? (c.audioMediaId || c.audioUrl ? t('comments.voice') : ''));
  // A voice-only comment cannot be played here, so the text says so with the speaker icon.
  const voiceOnly = !removed && !c.body && Boolean(c.audioMediaId || c.audioUrl);

  return (
    <View style={[styles.comment, { flexDirection: dir.row }, c.pending ? styles.pending : null]}>
      {/* The picture also opens the profile, for a thumb; screen readers get the name alone, not the same button twice. */}
      <Pressable
        onPress={openProfile}
        disabled={c.pending}
        hitSlop={faceSlop}
        {...decorative()}
        testID={`comment-face-${c.id}`}
        style={({ pressed }) => pressed && heldDim}
      >
        <InitialsAvatar name={author.username} id={author.id} size={size} photoUrl={author.avatarUrl} />
      </Pressable>
      <View style={styles.main}>
        <View style={[styles.byline, { flexDirection: dir.row }]}>
          <Pressable
            onPress={openProfile}
            disabled={c.pending}
            hitSlop={BYLINE_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('friends.openProfile', { username: author.username })}
            style={({ pressed }) => [styles.who, pressed && heldDim]}
          >
            <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
              {author.username}
            </Text>
          </Pressable>
          <Text style={[styles.age, { color: colors.textSecondary }]} numberOfLines={1}>
            {c.pending ? t('comments.posting') : noticeTime(c.createdAt, t, locale)}
          </Text>
        </View>
        {audio}
        {!audio || c.body ? (
          voiceOnly ? (
            <View style={[styles.voice, { flexDirection: dir.row }]}>
              <Icon name="speaker" size={16} color={colors.textPrimary} />
              <Text style={[styles.body, styles.voiceText, dir.text, { color: colors.textPrimary }]}>{text}</Text>
            </View>
          ) : (
            <Text style={[styles.body, removed ? dir.text : dir.free, { color: removed ? colors.textSecondary : colors.textPrimary }]}>{text}</Text>
          )
        ) : null}

        {/* Nothing to answer or take back until the server has it. */}
        {!c.pending && !removed ? (
          <View style={[styles.actions, { flexDirection: dir.row }]}>
            <Pressable
              onPress={() => require('comment') && thread.reply(c)}
              hitSlop={replySlop}
              accessibilityRole="button"
              testID={`comment-reply-${c.id}`}
              style={({ pressed }) => [styles.action, pressed && heldDim]}
            >
              <Text style={[styles.actionText, { color: colors.textSecondary }]}>{t('comments.reply')}</Text>
            </Pressable>
            {mine ? (
              // At the far end of the line from Reply, so their reaches do not touch.
              <Pressable
                onPress={() => thread.confirmDelete(c)}
                hitSlop={ACTION_SLOP}
                accessibilityRole="button"
                testID={`comment-delete-${c.id}`}
                style={({ pressed }) => [styles.action, dir.row === 'row-reverse' ? styles.actionApartLeft : styles.actionApart, pressed && heldDim]}
              >
                <Text style={[styles.actionText, { color: colors.danger }]}>{t('common.delete')}</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => onReport(c)}
                hitSlop={ACTION_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('moderation.reportComment')}
                testID={`comment-report-${c.id}`}
                style={({ pressed }) => [styles.action, { flexDirection: dir.row }, pressed && heldDim]}
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
            hitSlop={MORE_SLOP}
            accessibilityRole="button"
            accessibilityState={{ busy: loading }}
            testID={`comment-more-${c.id}`}
            style={({ pressed }) => [styles.more, { flexDirection: dir.row, alignSelf: edge }, pressed && heldDim]}
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
 * The comment composer, kept above the keyboard by the page's KeyboardAvoidingView and above the home indicator.
 * While replying it names the person, with an ✕ to go back to commenting on the post. `children` sits above the
 * field (the library's voice recorder).
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
  /** There is something to send. */
  ready: boolean;
  placeholder: string;
  maxLength: number;
  children?: ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  // In Soranî and Arabic the words start on the right and Send sits on the left, as in a chat.
  const dir = useDirection();
  const bottom = useScreenBottomInset(spacing.md);
  const { isGuest, require } = useAccountGate();
  const target = thread.replyingTo;
  /* A guest sees where a comment would go, and tapping it offers an account rather than a field that would be refused. */
  if (isGuest) {
    return (
      <View style={[styles.composerWrap, { paddingBottom: bottom }]}>
        <Pressable
          onPress={() => require('comment')}
          accessibilityRole="button"
          accessibilityLabel={placeholder}
          testID="comment-composer-guest"
          style={({ pressed }) => [styles.composer, dir.row === 'row-reverse' ? styles.composerRtl : null, { flexDirection: dir.row, backgroundColor: colors.glassFill, opacity: pressed ? pressedDim : 1 }]}
        >
          <Text style={[styles.input, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
            {placeholder}
          </Text>
          <View style={styles.send}>
            <Icon name="lock" size={20} color={colors.textSecondary} />
          </View>
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[styles.composerWrap, { paddingBottom: bottom }]}>
      {target ? (
        <View style={[styles.replying, { flexDirection: dir.row }]}>
          <Text style={[styles.replyingText, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
            {t('comments.replyingTo', { name: target.name })}
          </Text>
          <Pressable
            onPress={thread.cancelReply}
            hitSlop={(MIN_TOUCH_TARGET - 24) / 2}
            accessibilityRole="button"
            accessibilityLabel={t('comments.cancelReply')}
            style={({ pressed }) => [styles.cancel, pressed && heldDim]}
          >
            <Icon name="close" size={16} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}
      {children}
      <View style={[styles.composer, dir.row === 'row-reverse' ? styles.composerRtl : null, { flexDirection: dir.row, backgroundColor: colors.glassFill }]}>
        <TextInput
          ref={thread.inputRef}
          style={[styles.input, dir.free, { color: colors.textPrimary }]}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={target ? t('comments.replyingTo', { name: target.name }) : placeholder}
          value={value}
          onChangeText={onChangeText}
          multiline
          maxLength={maxLength}
        />
        {/* The one send control every field in the app has. */}
        <SendButton ready={ready} onPress={onSubmit} label={t('comments.post')} />
      </View>
    </View>
  );
}

/** The loading placeholder: three grey comments laid out like real ones. */
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

/*
 * A thread is the app's densest stack of controls, so no two reaches overlap (where they do, the later one takes
 * the tap): each reaches into a gap only as far as its neighbour leaves, and up to 44 where there is room.
 *
 * - Reply and Report are 24 tall and 16 apart; they reach 12 up and 8 down (44), and 8 toward each other.
 * - The next comment starts 12 below the last line: that line reaches 8 of it and the next name 4. The name
 *   reaches
 *   12 down into the text below it and 4 to either side.
 * - "Show replies" is 18 below Reply; each reaches 8 toward the other, so 40 tall.
 */
/** Half the 8 between a picture and the text beside it. */
const SEAM = spacing.sm / 2;
const ACTION_SLOP = { top: 12, bottom: 8, left: 8, right: 8 };
const BYLINE_SLOP = { top: SEAM, bottom: 12, left: SEAM, right: SEAM };
const MORE_SLOP = { top: 8, bottom: 8 };

const styles = StyleSheet.create({
  comment: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.sm + 4 },
  pending: { opacity: 0.6 },
  main: { flex: 1, gap: 2 },
  byline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { flexShrink: 1 },
  name: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  age: { fontSize: typography.sizes.xs },
  body: { fontSize: typography.sizes.md },
  voice: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  voiceText: { flexShrink: 1 },
  actions: { flexDirection: 'row', gap: spacing.md, paddingTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  actionApart: { marginLeft: 'auto' },
  actionApartLeft: { marginRight: 'auto' },
  actionText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  more: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, paddingVertical: spacing.xs, alignSelf: 'flex-start' },
  moreRule: { width: 24, height: StyleSheet.hairlineWidth },
  // Under the words of the comment they answer, not under its picture.
  replies: { marginLeft: AVATAR + spacing.sm },
  repliesRight: { marginRight: AVATAR + spacing.sm },
  composerWrap: { gap: spacing.sm, paddingTop: spacing.sm },
  replying: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  replyingText: { flex: 1, fontSize: typography.sizes.sm },
  cancel: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, borderRadius: radii.lg, paddingLeft: spacing.md, paddingRight: spacing.xs, paddingVertical: 2 },
  // The words' room on the right, Send's on the left.
  composerRtl: { paddingLeft: spacing.xs, paddingRight: spacing.md },
  input: { minHeight: MIN_TOUCH_TARGET, flex: 1, fontSize: typography.sizes.md, maxHeight: 120, paddingVertical: spacing.sm },
  send: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
