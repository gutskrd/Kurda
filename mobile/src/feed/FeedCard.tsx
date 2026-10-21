import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Animated, Pressable, Share, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import { HeartBurst } from '../theme/MotionParts';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { noticeTime } from '../notifications/inbox';
import { formatNumber } from '../i18n/format';
import { springTo, timing } from '../theme/animate';
import { useDirection } from '../reports/direction';
import { postUrl, toggleEngagement } from './api';
import { CARD_LABEL_KEY, feedImages, type EngagementKind, type FeedItem } from './types';
import { PostPictures } from '../composer/PostPictures';
import { usePostMenu } from '../composer/PostExtras';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { ReportSheet } from '../reports/ReportSheet';

/** The avatar beside a post's author: big enough to recognise somebody by. */
const AUTHOR = 34;
/** Two taps closer together than this are one double tap. */
const DOUBLE_TAP_MS = 260;

/**
 * One post on the wall, whichever half it came from: a written post and a
 * picture are the same shape, because on a wall they sit next to each other
 * and anything else reads as two apps stitched together.
 *
 * Posts follow one another as one chain: no box round a post and no line
 * between two, only the next post's face and name. Each is, top to bottom:
 * who posted it (with what kind of post under their name) and a "⋯" for its
 * menu; what was posted — the words of a written post, or the pictures from
 * edge to edge of the phone; a row of plain glyphs, each with its count
 * beside it — like, comment, repost, share, and saving it apart at the end;
 * a picture's caption after the name of whoever posted it; a way to its
 * comments; and how long ago.
 *
 * A heart is the one reaction there is. A double tap on the words or the
 * pictures likes the post, with a heart that blooms in the middle of it and
 * the tick of a like; a single tap opens it. A like counts at once, before
 * the server has answered, and quietly goes back if the server says no.
 *
 * The "⋯" is your own post's Edit and Delete, and anyone else's Report.
 * `standalone` is the post on its own page: nothing to open, and its
 * comments are already under it.
 *
 * No signed-out variant, unlike the web card: the phone's tabs sit behind the
 * auth stack, so anyone looking at this has an account.
 */
export function FeedCard({
  item,
  onChanged,
  standalone = false,
  onDeleted,
}: {
  item: FeedItem;
  /** told the fresh totals, so a like does not reload the wall */
  onChanged?: (next: FeedItem) => void;
  /** the post on its own page */
  standalone?: boolean;
  /** told when its author deletes it from its menu, so a page showing it can close */
  onDeleted?: () => void;
}): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  const { client } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  // each like made here, so the heart answers the press before the server does
  const [likes, setLikes] = useState(0);
  // each like made by a double tap, for the heart in the middle of the post
  const [blooms, setBlooms] = useState(0);
  // the engagement shown: the server's, or the change just made while it answers
  const [shown, setShown] = useState(item.engagement);
  const [reporting, setReporting] = useState(false);
  const pending = useRef<EngagementKind | null>(null);
  useEffect(() => setShown(item.engagement), [item.engagement]);

  const open = useCallback(() => {
    if (standalone) return;
    if (item.targetType === 'library') navigation.navigate('LibraryPost', { postId: item.id });
    else navigation.navigate('MemeDetail', { postId: item.id });
  }, [navigation, item.targetType, item.id, standalone]);
  // your own post's Edit and Delete, on a long press, the "⋯" (and as an action for a screen reader)
  const menu = usePostMenu({ targetType: item.targetType, id: item.id, authorId: item.author.id }, { onActivate: open, onDeleted });
  const openAuthor = useCallback(() => navigation.navigate('UserProfile', { userId: item.author.id }), [navigation, item.author.id]);
  /**
   * Like, repost or save at once, and tell the server after: the glyph fills
   * and the count moves under the finger. The server's answer brings the true
   * totals (somebody else may have liked it meanwhile); a refusal puts back
   * what was there.
   */
  const toggle = useCallback(
    async (kind: EngagementKind) => {
      if (pending.current) return;
      pending.current = kind;
      const before = shown;
      const flag = kind === 'like' ? 'liked' : kind === 'repost' ? 'reposted' : 'bookmarked';
      const count = kind === 'like' ? 'likes' : kind === 'repost' ? 'reposts' : 'bookmarks';
      const on = !before[flag];
      setShown({ ...before, [flag]: on, [count]: Math.max(0, before[count] + (on ? 1 : -1)) });
      const res = await toggleEngagement(client, item, kind);
      pending.current = null;
      if (!res.ok) {
        setShown(before);
        return;
      }
      setShown(res.data.engagement);
      onChanged?.({ ...item, engagement: res.data.engagement });
    },
    [client, item, onChanged, shown],
  );

  const like = useCallback(() => {
    // a like is felt and pops; taking one back is quiet
    if (!shown.liked) {
      haptic('tap');
      setLikes((n) => n + 1);
    }
    void toggle('like');
  }, [shown.liked, toggle]);

  /*
   * One tap opens the post; two quick taps like it. The first tap waits a
   * moment to see whether a second follows — the price of the gesture, and
   * the reason it is short. A double tap on a post already liked keeps it
   * liked: the gesture only ever adds a heart, never takes one away.
   */
  const lastTap = useRef(0);
  const single = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => (single.current ? clearTimeout(single.current) : undefined), []);
  const tap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      if (single.current) clearTimeout(single.current);
      single.current = null;
      setBlooms((n) => n + 1);
      if (!shown.liked) like();
      return;
    }
    lastTap.current = now;
    single.current = setTimeout(() => {
      single.current = null;
      open();
    }, DOUBLE_TAP_MS);
  }, [like, open, shown.liked]);

  /**
   * Hand the post to whatever the phone shares with: the system sheet, where
   * every app already puts this, reaching the messaging app somebody uses.
   */
  const share = useCallback(async () => {
    const url = postUrl(item);
    const message = item.title ? `${item.title}\n${url}` : url;
    try {
      await Share.share({ message, url });
    } catch {
      // the sheet was dismissed, or the platform refused it; nothing was shared
    }
  }, [item]);

  // an unfamiliar kind prints itself rather than an empty word
  const badgeKey = CARD_LABEL_KEY[item.kind];
  const badge = badgeKey ? t(badgeKey) : item.kind;
  const who = item.author.displayName || item.author.username;
  const e = shown;
  const pictures = feedImages(item);
  const when = noticeTime(item.at, t, locale);
  const count = (n: number): number | undefined => (n > 0 ? n : undefined);
  // a picture's words are its caption, under it; a written post's words are the post
  const words = item.title || item.excerpt;

  return (
    <View style={styles.post}>
      {/* who, and what kind of post under their name; the "⋯" at the end */}
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <Pressable onPress={openAuthor} accessibilityRole="button" accessibilityLabel={who} hitSlop={4}>
          <InitialsAvatar name={who} id={item.author.id} size={AUTHOR} photoUrl={item.author.avatarUrl} />
        </Pressable>
        <View style={styles.byline}>
          <Text style={[styles.who, dir.free, { color: colors.textPrimary }]} numberOfLines={1} onPress={openAuthor} accessibilityRole="link">
            {who}
          </Text>
          <Text style={[styles.kind, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
            {badge}
          </Text>
        </View>
        <Pressable
          onPress={menu.open ?? (() => setReporting(true))}
          accessibilityRole="button"
          accessibilityLabel={menu.open ? t('post.menu') : t('moderation.reportPost')}
          hitSlop={6}
          style={styles.more}
        >
          <Icon name="more" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <Bloom fired={blooms}>
        {pictures.length === 0 && words ? (
          <Pressable
            onPress={tap}
            onLongPress={menu.open}
            {...menu.a11y}
            accessibilityRole={standalone ? undefined : 'button'}
            accessibilityLabel={item.title ? `${badge}: ${item.title}` : `${badge} — ${who}`}
            accessibilityHint={t('feed.doubleTapHint')}
            style={styles.words}
          >
            {item.title ? (
              <Text style={[styles.title, dir.free, { color: colors.textPrimary }]} numberOfLines={standalone ? undefined : 2}>
                {item.title}
              </Text>
            ) : null}
            {item.excerpt ? (
              <Text style={[styles.excerpt, dir.free, { color: colors.textPrimary }]} numberOfLines={standalone ? undefined : 6}>
                {item.excerpt}
              </Text>
            ) : null}
          </Pressable>
        ) : null}

        {pictures.length > 0 ? (
          // the pictures from edge to edge of the phone, each named by what it shows, the double tap reaching them too
          <PostPictures images={pictures} onPress={tap} onLongPress={menu.open} bleed />
        ) : null}
      </Bloom>

      <View style={[styles.actions, { flexDirection: dir.row }]}>
        <Action
          icon={e.liked ? 'heart-fill' : 'heart'}
          tint={e.liked ? colors.danger : undefined}
          on={e.liked}
          label={e.liked ? t('feed.unlike') : t('feed.like')}
          count={count(e.likes)}
          burst={likes}
          onPress={like}
        />
        <Action icon="chat" label={t('feed.comments', { count: item.commentCount })} count={count(item.commentCount)} onPress={open} />
        <Action
          icon="repost"
          on={e.reposted}
          label={e.reposted ? t('repost.undo') : t('repost.do')}
          count={count(e.reposts)}
          onPress={() => void toggle('repost')}
        />
        <Action icon="send" label={t('share.post')} onPress={() => void share()} />
        <View style={styles.spacer} />
        <Action
          icon={e.bookmarked ? 'bookmark-fill' : 'bookmark'}
          on={e.bookmarked}
          label={e.bookmarked ? t('feed.removeFromSaved') : t('feed.save')}
          onPress={() => void toggle('bookmark')}
        />
      </View>

      {/* a picture's caption, after the name of whoever posted it */}
      {pictures.length > 0 && words ? (
        <Text style={[styles.caption, dir.free, { color: colors.textPrimary }]} numberOfLines={standalone ? undefined : 3} onPress={standalone ? undefined : open}>
          <Text style={styles.captionWho}>{item.author.username}</Text>
          {` ${[item.title, item.excerpt].filter(Boolean).join(' ')}`}
        </Text>
      ) : null}
      {!standalone && item.commentCount > 0 ? (
        <Text style={[styles.toComments, dir.text, { color: colors.textSecondary }]} onPress={open} accessibilityRole="link">
          {item.commentCount === 1 ? t('feed.viewComment') : t('feed.viewComments', { count: formatNumber(item.commentCount, locale) })}
        </Text>
      ) : null}
      <Text style={[styles.age, dir.text, { color: colors.textSecondary }]}>{when}</Text>

      {menu.sheet}
      {reporting ? (
        <ReportSheet
          visible
          target={item.targetType === 'library' ? { type: 'library_post', postId: item.id } : { type: 'image_post', postId: item.id }}
          blockable={{ userId: item.author.id, name: item.author.username }}
          onClose={() => setReporting(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * The heart that blooms in the middle of a post liked by a double tap: it
 * grows past its size, settles, and fades, in about two thirds of a second.
 * Under Reduce Motion it only fades in and out.
 */
function Bloom({ fired, children }: { fired: number; children: React.ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const seen = useRef(fired);
  useEffect(() => {
    if (fired === seen.current) return;
    seen.current = fired;
    scale.setValue(reduce ? 1 : 0.3);
    opacity.setValue(1);
    const grow = reduce ? Animated.delay(0) : springTo(scale, 1, 'bouncy');
    Animated.sequence([grow, Animated.delay(320), timing(opacity, 0, 220)]).start();
  }, [fired, reduce, scale, opacity]);
  return (
    <View>
      {children}
      <View pointerEvents="none" style={styles.bloomLayer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={{ opacity, transform: [{ scale }] }}>
          <Icon name="heart-fill" size={92} color={colors.danger} />
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * A post while the wall loads: its head, a title on most, a couple of lines
 * and the row of glyphs, at the post's own spacing — so the real one lands in
 * the grey one's place. A written post with no title comes first because that
 * is what most of a wall is.
 */
export function FeedCardSkeleton({ titled = true, lines = 2 }: { titled?: boolean; lines?: number }): React.JSX.Element {
  return (
    <View style={styles.post}>
      <View style={styles.head}>
        <Skeleton width={AUTHOR} height={AUTHOR} radius={radii.pill} />
        <View style={styles.byline}>
          <SkeletonText size={typography.sizes.sm} width="42%" />
        </View>
      </View>
      <View style={styles.words}>
        {titled ? <SkeletonText size={typography.sizes.lg} lineHeight={TITLE_LINE} width="52%" /> : null}
        {/* one paragraph, its lines with nothing between them */}
        <View>
          {Array.from({ length: lines }, (_, i) => (
            <SkeletonText key={i} size={typography.sizes.md} width={i === lines - 1 ? '64%' : '94%'} />
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.action}>
            <Skeleton width={24} height={24} radius={radii.pill} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** As many posts as reach the foot of the screen, the way the wall lays them out. */
export function FeedSkeleton({ style }: { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { height, width } = useWindowDimensions();
  const { t } = useI18n();
  const count = Math.max(2, Math.ceil(height / 200));
  // a few lines of a post run to two on a phone and fit on one across a tablet
  const lines = width >= WIDE ? 1 : 2;
  return (
    <View style={style} accessibilityLabel={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <FeedCardSkeleton key={i} titled={i % 3 !== 0} lines={lines} />
      ))}
    </View>
  );
}

/** past this a short paragraph fits on one line */
const WIDE = 600;
/** display(20) sets 1.12 */
const TITLE_LINE = Math.round(20 * typography.displayLineHeight);

/**
 * One glyph in the row under a post: 24pt, in a full 44pt square, the count
 * beside it when there is one.
 *
 * The label says what pressing it does, never what it counts: a number is
 * what a screen reader announces as the name unless told otherwise, and "4"
 * tells you nothing about what would happen.
 */
function Action({
  icon,
  label,
  count,
  on = false,
  tint,
  burst,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: number;
  on?: boolean;
  /** the colour while on, when it is not the ink (a red heart) */
  tint?: string;
  /** goes up each time the icon should pop with a burst (a like) */
  burst?: number;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const colour = tint ?? colors.textPrimary;
  const glyph = <Icon name={icon} size={24} color={colour} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={count ? `${label} (${count})` : label}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      {burst !== undefined ? (
        <HeartBurst fired={burst} color={colors.danger} size={24}>
          {glyph}
        </HeartBurst>
      ) : (
        glyph
      )}
      {count ? <Text style={[styles.count, { color: colors.textPrimary }]}>{formatNumber(count, locale)}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // no box and no line: a post is followed by the next one's face and name, a little space between
  post: { paddingTop: spacing.sm, paddingBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingHorizontal: layout.gutter, marginBottom: spacing.sm },
  byline: { flex: 1, minWidth: 0 },
  who: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  kind: { fontSize: typography.sizes.xs },
  more: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginEnd: -spacing.sm },
  words: { paddingHorizontal: layout.gutter, gap: 4, paddingBottom: spacing.xs },
  title: { ...display(20) },
  excerpt: { fontSize: typography.sizes.md, lineHeight: 23 },
  bloomLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  // the glyphs start under the author's face, the gutter less the room round a 24pt glyph in a 44pt square
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: layout.gutter - (MIN_TOUCH_TARGET - 24) / 2 },
  spacer: { flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: 4 },
  pressed: { opacity: 0.5 },
  count: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  caption: { paddingHorizontal: layout.gutter, fontSize: typography.sizes.sm, lineHeight: 20 },
  captionWho: { fontWeight: typography.weights.semibold },
  toComments: { paddingHorizontal: layout.gutter, paddingTop: 4, fontSize: typography.sizes.sm },
  age: { paddingHorizontal: layout.gutter, paddingTop: 4, fontSize: typography.sizes.xs },
});
