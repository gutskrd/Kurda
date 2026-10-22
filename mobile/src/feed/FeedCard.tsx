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
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { noticeTime } from '../notifications/inbox';
import { formatCompact, formatNumber } from '../i18n/format';
import type { Locale } from '../i18n/translations';
import { springTo, timing } from '../theme/animate';
import { useDirection } from '../reports/direction';
import { postUrl, toggleEngagement } from './api';
import { CARD_LABEL_KEY, feedImages, type EngagementKind, type FeedItem } from './types';
import { PostPictures } from '../composer/PostPictures';
import { usePostMenu } from '../composer/PostExtras';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { ReportSheet } from '../reports/ReportSheet';

/** The avatar beside a post's author: big enough to recognise somebody by, small enough to sit on one line. */
const AUTHOR = 32;
/** Two taps closer together than this are one double tap. */
const DOUBLE_TAP_MS = 260;

/**
 * One post on the wall, whichever half it came from: a written post and a
 * picture are the same shape, because on a wall they sit next to each other
 * and anything else reads as two apps stitched together.
 *
 * Posts follow one another as one chain, a hairline across the page between
 * two and no box round any. Each is, top to bottom, the same in every post:
 * one line of who posted it, what kind of post and how long ago, with a "⋯"
 * for its menu at the end; its words — a bold title and a few lines of the
 * rest; its pictures, inside the page's margins with rounded corners; and a
 * row of soft pills, each a glyph and its count — like, comments, repost —
 * with share and save as round buttons at the far end.
 *
 * The words always come before the pictures, so what a post is about is read
 * first and every post on the wall starts the same way.
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
    <View style={[styles.post, !standalone && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      {/* one line: who, what kind of post and how long ago; the "⋯" at the end */}
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <Pressable onPress={openAuthor} accessibilityRole="button" accessibilityLabel={who} hitSlop={6}>
          <InitialsAvatar name={who} id={item.author.id} size={AUTHOR} photoUrl={item.author.avatarUrl} />
        </Pressable>
        <View style={[styles.byline, { flexDirection: dir.row }]}>
          <Text style={[styles.who, dir.free, { color: colors.textPrimary }]} numberOfLines={1} onPress={openAuthor} accessibilityRole="link">
            {who}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {`${badge} · ${when}`}
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
        {words ? (
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
              <Text style={[styles.title, dir.free, { color: colors.textPrimary }]} numberOfLines={standalone ? undefined : 3}>
                {item.title}
              </Text>
            ) : null}
            {item.excerpt ? (
              <Text style={[styles.excerpt, dir.free, { color: colors.textPrimary }]} numberOfLines={standalone ? undefined : 4}>
                {item.excerpt}
              </Text>
            ) : null}
          </Pressable>
        ) : null}

        {pictures.length > 0 ? (
          // under the words, inside the margins, each named by what it shows, the double tap reaching them too
          <View style={styles.pictures}>
            <PostPictures images={pictures} onPress={tap} onLongPress={menu.open} wall />
          </View>
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
          tint={e.reposted ? colors.success : undefined}
          label={e.reposted ? t('repost.undo') : t('repost.do')}
          count={count(e.reposts)}
          onPress={() => void toggle('repost')}
        />
        <View style={styles.spacer} />
        <Action icon="send" label={t('share.post')} onPress={() => void share()} />
        <Action
          icon={e.bookmarked ? 'bookmark-fill' : 'bookmark'}
          on={e.bookmarked}
          label={e.bookmarked ? t('feed.removeFromSaved') : t('feed.save')}
          onPress={() => void toggle('bookmark')}
        />
      </View>


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
 * A post while the wall loads: its one-line head, a title on most, a couple
 * of lines and the row of pills, at the post's own spacing — so the real one
 * lands in the grey one's place. A written post with no title comes first
 * because that is what most of a wall is.
 */
export function FeedCardSkeleton({ titled = true, lines = 2 }: { titled?: boolean; lines?: number }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.post, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      <View style={styles.head}>
        <Skeleton width={AUTHOR} height={AUTHOR} radius={radii.pill} />
        <View style={styles.byline}>
          <SkeletonText size={typography.sizes.sm} width="46%" />
        </View>
      </View>
      <View style={styles.words}>
        {titled ? <SkeletonText size={TITLE_SIZE} lineHeight={TITLE_LINE} width="62%" /> : null}
        {/* one paragraph, its lines with nothing between them */}
        <View>
          {Array.from({ length: lines }, (_, i) => (
            <SkeletonText key={i} size={typography.sizes.md} width={i === lines - 1 ? '64%' : '94%'} />
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <Skeleton width={64} height={PILL} radius={radii.pill} />
        <Skeleton width={56} height={PILL} radius={radii.pill} />
        <View style={styles.spacer} />
        <Skeleton width={PILL} height={PILL} radius={radii.pill} />
        <Skeleton width={PILL} height={PILL} radius={radii.pill} />
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
/** a title is bold and a size up from what is under it, in the face the rest of the post is in */
const TITLE_SIZE = 19;
const TITLE_LINE = 25;
/** a pill's height: drawn at 36, reached at 44 */
const PILL = 36;
const PILL_SLOP = { top: (MIN_TOUCH_TARGET - PILL) / 2, bottom: (MIN_TOUCH_TARGET - PILL) / 2, left: 2, right: 2 };

/**
 * One soft pill in the row under a post: a 20pt glyph and its count when
 * there is one, or a round button the same height when there is not. Filled,
 * not framed, and filled no differently when on — the glyph says that (a red
 * heart, a green repost, a filled bookmark).
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
  /** the colour while on, when it is not the ink (a red heart, a green repost) */
  tint?: string;
  /** goes up each time the icon should pop with a burst (a like) */
  burst?: number;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const colour = tint ?? colors.textPrimary;
  const glyph = <Icon name={icon} size={20} color={colour} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={count ? `${label} (${count})` : label}
      hitSlop={PILL_SLOP}
      style={({ pressed }) => [styles.pill, count ? styles.pillWide : null, { backgroundColor: colors.controlTrack }, pressed && styles.pressed]}
    >
      {burst !== undefined ? (
        <HeartBurst fired={burst} color={colors.danger} size={20}>
          {glyph}
        </HeartBurst>
      ) : (
        glyph
      )}
      {count ? <Text style={[styles.count, { color: tint ?? colors.textPrimary }]}>{pillCount(count, locale)}</Text> : null}
    </Pressable>
  );
}

/** A count in a pill: whole up to 9,999, then short ("12.3K"), so five pills fit across a phone, as on the website. */
export function pillCount(n: number, locale: Locale): string {
  return n < 10_000 ? formatNumber(n, locale) : formatCompact(n, locale);
}

const styles = StyleSheet.create({
  // no box: a hairline across the page under each post, the same room above and below it
  post: { paddingTop: spacing.sm + 4, paddingBottom: spacing.sm + 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter, marginBottom: spacing.sm },
  byline: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  who: { flexShrink: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  meta: { flexShrink: 0, fontSize: typography.sizes.sm },
  more: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginVertical: -6, marginEnd: -spacing.sm - 2 },
  words: { paddingHorizontal: layout.gutter, gap: 6, paddingBottom: spacing.sm + 2 },
  title: { fontSize: TITLE_SIZE, lineHeight: TITLE_LINE, fontWeight: typography.weights.bold },
  excerpt: { fontSize: typography.sizes.md, lineHeight: 23 },
  pictures: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm + 2 },
  bloomLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter, paddingTop: 2 },
  spacer: { flex: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: PILL, height: PILL, borderRadius: radii.pill },
  pillWide: { paddingHorizontal: spacing.sm + 4 },
  pressed: { opacity: 0.6 },
  count: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
});
