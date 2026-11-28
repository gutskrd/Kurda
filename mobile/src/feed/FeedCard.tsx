import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Animated, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable, ReachGroup } from '../theme/Pressable';
import { useAuth } from '../auth/AuthContext';
import { useIntents } from '../api/optimistic';
import { useAccountGate } from '../auth/AccountGate';
import { haptic } from '../feedback/haptics';
import { HeartBurst, heldDim } from '../theme/MotionParts';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import type { RootNavigation } from '../navigation/rootStack';
import { Avatar } from '../profile/Avatar';
import { fontScaleCap, layout, radii, spacing, typography } from '../theme/tokens';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { noticeTime } from '../notifications/inbox';
import { formatCompact, formatNumber } from '../i18n/format';
import { springTo, timing } from '../theme/animate';
import { useDirection } from '../reports/direction';
import { setEngagement } from './api';
import { SharePostSheet } from './SharePostSheet';
import { PostGiftsRow, usePostGifts } from './PostGifts';
import { canGiveGifts } from '../gifts/access';
import { CARD_LABEL_KEY, feedImages, type EngagementKind, type FeedItem, type PostEngagement } from './types';
import { PostPictures } from '../composer/PostPictures';
import { usePostMenu } from '../composer/PostExtras';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { ReportSheet } from '../reports/ReportSheet';
import { pressedDim } from '../theme/motion';
import { HeldNote } from '../pictures/PictureReview';
import { usePageWidth } from '../theme/pageWidth';

/** The author's avatar: big enough to recognise, small enough for one line. */
const AUTHOR = 32;
/**
 * Two taps closer than this are a double tap. It is also how long a single tap waits before opening the post, so
 * it is as short as a comfortable double tap; the press shows feedback at once, so the wait is never silent.
 */
export const DOUBLE_TAP_MS = 220;

const FLAG = { like: 'liked', repost: 'reposted', bookmark: 'bookmarked' } as const;
const COUNT = { like: 'likes', repost: 'reposts', bookmark: 'bookmarks' } as const;

/** The server's engagement with each wanted flag laid over it, its count moved by one where the two differ. */
function withWishes(told: PostEngagement, wanted: (kind: EngagementKind) => boolean): PostEngagement {
  const shown = { ...told };
  for (const kind of ['like', 'repost', 'bookmark'] as const) {
    const on = wanted(kind);
    if (on === told[FLAG[kind]]) continue;
    shown[FLAG[kind]] = on;
    shown[COUNT[kind]] = Math.max(0, told[COUNT[kind]] + (on ? 1 : -1));
  }
  return shown;
}

/** A post's like, repost and save as drawn, and the taps that change them; shared by its card and its own page. */
export interface PostEngagementState {
  shown: PostEngagement;
  /** Goes up with each like made here, for the heart's burst. */
  likes: number;
  like: () => void;
  act: (kind: EngagementKind) => void;
}

/**
 * Like, repost and save, each shown at once and sent on its own (api/optimistic.ts); the server's answer brings the
 * true totals, and a refusal goes back with a short message. Guests are offered an account first (auth/AccountGate).
 * `onChanged` is told the fresh totals.
 */
export function usePostEngagement(item: FeedItem, onChanged?: (next: FeedItem) => void): PostEngagementState {
  const { client } = useAuth();
  const { require } = useAccountGate();
  const [likes, setLikes] = useState(0);
  // The engagement as the server last told it: the item's, or a fresher answer to a tap here.
  const [told, setTold] = useState(item.engagement);
  useEffect(() => setTold(item.engagement), [item.engagement]);

  const wishes = useIntents<EngagementKind, boolean, { on: boolean; engagement: PostEngagement }>(
    async (kind, on) => {
      const res = await setEngagement(client, item, kind, on);
      if (res.ok) {
        setTold(res.data.engagement);
        onChanged?.({ ...item, engagement: res.data.engagement });
      }
      return res;
    },
    { answered: (data) => data.on },
  );
  const shown = withWishes(told, (kind) => wishes.shown(kind, told[FLAG[kind]]));
  const now = useRef(shown);
  now.current = shown;

  /** Whether a tap on one of the three may go ahead: a guest is offered an account first, before any feedback. */
  const may = useCallback((kind: EngagementKind): boolean => require(kind === 'bookmark' ? 'save' : 'react'), [require]);

  const act = useCallback(
    (kind: EngagementKind) => {
      if (may(kind)) wishes.want(kind, !now.current[FLAG[kind]], told[FLAG[kind]]);
    },
    [may, wishes, told],
  );

  const like = useCallback(() => {
    if (!may('like')) return;
    // A like is felt and pops; taking one back is quiet.
    if (!now.current.liked) {
      haptic('tap');
      setLikes((n) => n + 1);
    }
    wishes.want('like', !now.current.liked, told.liked);
  }, [may, wishes, told]);

  return { shown, likes, like, act };
}

/**
 * The row of pills under a post: like, comments, repost, then gift, share and save at the far end, with the post's gifts
 * in a small row above them (PostGifts). Share opens a sheet that passes the post on, out of the app or to a friend in
 * chat (SharePostSheet), as the website's does; gift opens the gift sheet for this post, which says in one line when the
 * rules do not let a gift go yet. A post still being checked cannot be passed on or given to yet, so it has neither
 * repost, gift nor share; nor is there a gift for one's own post, or for a child's profile.
 */
export function PostActions({
  item,
  engage,
  onComment,
}: {
  item: FeedItem;
  engage: PostEngagementState;
  onComment: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const { user } = useAuth();
  const [sharing, setSharing] = useState(false);
  const gifts = usePostGifts(item);
  const e = engage.shown;
  const count = (n: number): number | undefined => (n > 0 ? n : undefined);
  const held = item.review === 'held';
  const giftable = !held && canGiveGifts(user) && user?.id !== item.author.id && !item.author.unavailable;
  return (
    <>
    <PostGiftsRow item={item} gifts={gifts.gifts} />
    <View style={[styles.actions, { flexDirection: dir.row }]}>
      {/* The pills share the row's gap between them, and the 12 above them with what they are under. */}
      <ReachGroup gap={spacing.sm} rowGap={ACTIONS_ABOVE}>
        <Action
          icon={e.liked ? 'heart-fill' : 'heart'}
          tint={e.liked ? colors.like : undefined}
          inkCount
          on={e.liked}
          label={e.liked ? t('feed.unlike') : t('feed.like')}
          count={count(e.likes)}
          burst={engage.likes}
          onPress={engage.like}
        />
        <Action
          icon="chat"
          label={t('feed.comments', { count: formatNumber(item.commentCount, locale) })}
          counted
          count={count(item.commentCount)}
          onPress={onComment}
        />
        {held ? null : (
          <Action
            icon="repost"
            on={e.reposted}
            tint={e.reposted ? colors.success : undefined}
            label={e.reposted ? t('repost.undo') : t('repost.do')}
            count={count(e.reposts)}
            onPress={() => engage.act('repost')}
          />
        )}
        <View style={styles.spacer} />
        {giftable ? <Action icon="gift" label={t('post.gift')} onPress={gifts.give} /> : null}
        {/* Sharing has its own glyph: the paper plane means Messages and Send. */}
        {held ? null : <Action icon="share" label={t('share.post')} onPress={() => setSharing(true)} />}
        <Action
          icon={e.bookmarked ? 'bookmark-fill' : 'bookmark'}
          tint={e.bookmarked ? colors.saved : undefined}
          edge={e.bookmarked ? colors.savedEdge : undefined}
          on={e.bookmarked}
          label={e.bookmarked ? t('feed.removeFromSaved') : t('feed.save')}
          onPress={() => engage.act('bookmark')}
        />
      </ReachGroup>
      {sharing && !held ? <SharePostSheet item={item} onClose={() => setSharing(false)} /> : null}
      {giftable ? gifts.sheet : null}
    </View>
    </>
  );
}

/**
 * One post on the wall, written or a picture, in one shape: a header line (author, kind, age, "⋯"), the text, the
 * pictures, and a row of pills (`PostActions`). A double tap likes with a blooming heart; a single tap opens the post.
 * `standalone` is the post on its own page. Memoised, since liking one post re-renders the wall.
 */
export const FeedCard = memo(function FeedCard({
  item,
  onChanged,
  standalone = false,
  onDeleted,
}: {
  item: FeedItem;
  /** Told the fresh totals, so a like does not reload the wall. */
  onChanged?: (next: FeedItem) => void;
  /** The post on its own page. */
  standalone?: boolean;
  /** Told when its author deletes it from its menu, so a page showing it can close. */
  onDeleted?: () => void;
}): React.JSX.Element {
  const navigation = useNavigation<RootNavigation>();
  // A guest reads the wall; liking, reposting and saving are the account's (auth/AccountGate).
  const { require } = useAccountGate();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  // Each like made by a double tap, for the heart in the middle of the post.
  const [blooms, setBlooms] = useState(0);
  const [reporting, setReporting] = useState(false);
  const engage = usePostEngagement(item, onChanged);
  const { like } = engage;
  const liked = engage.shown.liked;

  const open = useCallback(() => {
    if (standalone) return;
    if (item.targetType === 'library') navigation.navigate('LibraryPost', { postId: item.id });
    else navigation.navigate('MemeDetail', { postId: item.id });
  }, [navigation, item.targetType, item.id, standalone]);
  // Your own post's Edit and Delete, on a long press, the "⋯" (and as an action for a screen reader).
  const menu = usePostMenu({ targetType: item.targetType, id: item.id, authorId: item.author.id }, { onDeleted, onActivate: open });
  const openAuthor = useCallback(() => navigation.navigate('UserProfile', { userId: item.author.id }), [navigation, item.author.id]);

  /*
   * One tap opens the post; two quick taps like it, so the first tap waits briefly for a second. A double tap on
   * a liked post keeps it liked: the gesture only adds a heart.
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
      // A guest's double tap asks for the account before any heart blooms.
      if (!require('react')) return;
      setBlooms((n) => n + 1);
      if (!liked) like();
      return;
    }
    lastTap.current = now;
    single.current = setTimeout(() => {
      single.current = null;
      open();
    }, DOUBLE_TAP_MS);
  }, [like, open, liked, require]);

  // An unfamiliar kind prints itself rather than an empty word.
  const badgeKey = CARD_LABEL_KEY[item.kind];
  const badge = badgeKey ? t(badgeKey) : item.kind;
  // Kept content of a suspended or banned account names nobody and opens nothing.
  const gone = item.author.unavailable === true;
  const who = gone ? t('account.unavailableByline') : item.author.displayName || item.author.username;
  const pictures = feedImages(item);
  const when = noticeTime(item.at, t, locale);
  // A picture's words are its caption, under it; a written post's words are the post.
  const words = item.title || item.excerpt;

  return (
    <View style={[styles.post, !standalone && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      {/*
        One line: author, kind and age, with the "⋯" at the end. The picture, name and "⋯" each reach a fingertip
        up and down and split the gaps between them.
      */}
      <View style={[styles.head, { flexDirection: dir.row }]}>
        <ReachGroup gap={spacing.sm}>
          {gone ? (
            <Avatar name="" size={AUTHOR} photoUrl={null} />
          ) : (
            <Pressable
              onPress={openAuthor}
              accessibilityRole="button"
              accessibilityLabel={who}
              reachSize={{ width: AUTHOR, height: AUTHOR }}
              style={({ pressed }) => pressed && heldDim}
            >
              <Avatar name={who} size={AUTHOR} photoUrl={item.author.avatarUrl} />
            </Pressable>
          )}
          <View style={[styles.byline, { flexDirection: dir.row }]}>
            {gone ? (
              <Text style={[styles.who, styles.whoLink, dir.text, { color: colors.textSecondary }]} numberOfLines={1} testID="post-author">
                {who}
              </Text>
            ) : (
              // A control of its own, since a pressable run of text cannot reach past its letters.
              <Pressable
                onPress={openAuthor}
                accessibilityRole="link"
                reachSize={{ height: NAME_LINE }}
                testID="post-author"
                style={({ pressed }) => [styles.whoLink, pressed && heldDim]}
              >
                <Text style={[styles.who, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
                  {who}
                </Text>
              </Pressable>
            )}
            <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
              {`${badge} · ${when}`}
            </Text>
          </View>
          <Pressable
            onPress={menu.open ?? (() => setReporting(true))}
            accessibilityRole="button"
            accessibilityLabel={menu.open ? t('post.menu') : t('moderation.reportPost')}
            reach="open"
            style={({ pressed }) => [styles.more, pressed && heldDim]}
          >
            <Icon name="more" size={22} color={colors.textPrimary} />
          </Pressable>
        </ReachGroup>
      </View>

      {/* Your own post while its pictures wait for a person: only you see it meanwhile. */}
      {item.review === 'held' ? <HeldNote style={styles.held} testID="post-held" /> : null}

      <Bloom fired={blooms}>
        {words ? (
          <Pressable
            onPress={tap}
            onLongPress={menu.open}
            {...menu.a11y}
            accessibilityRole={standalone ? undefined : 'button'}
            accessibilityLabel={item.title ? `${badge}: ${item.title}` : `${badge} — ${who}`}
            accessibilityHint={t('feed.doubleTapHint')}
            // Feedback is immediate, as for a held row; the tap itself waits briefly to see whether a second follows.
            style={({ pressed }) => [styles.words, pressed && !standalone && { backgroundColor: colors.controlTrack }]}
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
          // Under the text, within the margins, each labelled by what it shows; the double tap reaches them too.
          <View style={styles.pictures}>
            <PostPictures images={pictures} onPress={tap} onLongPress={menu.open} wall />
          </View>
        ) : null}
      </Bloom>

      <PostActions item={item} engage={engage} onComment={open} />

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
});

/**
 * The heart that blooms on a double-tap like: it grows past its size, settles and fades in about two thirds of a
 * second. Under Reduce Motion it only fades.
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
          <Icon name="heart-fill" size={92} color={colors.like} />
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * A post's loading placeholder at the post's own spacing: the head line, a title, a couple of lines and the
 * pills. An untitled written post comes first, since that is most of a wall.
 */
export function FeedCardSkeleton({ titled = true, lines = 2 }: { titled?: boolean; lines?: number }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.post, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator }]}>
      <View style={styles.head}>
        <Skeleton width={AUTHOR} height={AUTHOR} radius={radii.pill} />
        <View style={styles.byline}>
          <SkeletonText size={typography.sizes.text} width="46%" />
        </View>
      </View>
      <View style={styles.words}>
        {titled ? <SkeletonText size={TITLE_SIZE} lineHeight={TITLE_LINE} width="62%" /> : null}
        {/* One paragraph, its lines with nothing between them. */}
        <View>
          {Array.from({ length: lines }, (_, i) => (
            <SkeletonText key={i} size={typography.sizes.text} width={i === lines - 1 ? '64%' : '94%'} />
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
  const { height } = useWindowDimensions();
  const width = usePageWidth();
  const { t } = useI18n();
  const count = Math.max(2, Math.ceil(height / 200));
  // A few lines of a post run to two on a phone and fit on one across a tablet.
  const lines = width >= WIDE ? 1 : 2;
  return (
    <View style={style} accessibilityLabel={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <FeedCardSkeleton key={i} titled={i % 3 !== 0} lines={lines} />
      ))}
    </View>
  );
}

/** Past this a short paragraph fits on one line. */
const WIDE = 600;
/** A title is bold and a size up from what is under it, in the face the rest of the post is in. */
const TITLE_SIZE = typography.sizes.text;
const TITLE_LINE = 25;
/**
 * A pill's height, and the width of one without a count: drawn at 36 and reaching 48 up and down; across, the row's
 * 8 gap is shared between neighbours, so 44.
 */
const PILL = 36;
/**
 * The gap between the text or pictures and the pills: 6 under the text, inside what opens the post, and the pill
 * row's own 6, which their reach takes. Inside the text's box, the later-drawn pills would steal the bottom of
 * its presses.
 */
const ACTIONS_ABOVE = spacing.sm + 4;
/** The author's name: one line of the small size. */
const NAME_LINE = 18;

/**
 * One control under a post: a 20 pt glyph with its count, or the glyph alone in a box as wide as it is tall. Unfilled,
 * so all six and three counts of "5.6M" fit across a 360 pt phone; on is shown by the glyph (a red heart, a green
 * repost, a yellow bookmark). A count too long for the room left shrinks rather than wrapping or pushing the row off
 * the screen. The label says what pressing does, with the whole count after it ("Like (3,400)"), never the short one.
 */
function Action({
  icon,
  label,
  count,
  counted = false,
  on = false,
  tint,
  edge,
  inkCount = false,
  burst,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: number;
  /** The label already says how many ("3,400 comments"), so the count is not said again after it. */
  counted?: boolean;
  on?: boolean;
  /** The colour while on, when it is not the ink (a red heart, a green repost, a yellow bookmark). */
  tint?: string;
  /** The on glyph's hairline, where its colour alone is faint on the page. */
  edge?: string;
  /** The count stays in the ink while the glyph is tinted: the heart says it, the number counts it. */
  inkCount?: boolean;
  /** Goes up each time the icon should pop with a burst (a like). */
  burst?: number;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { locale } = useI18n();
  const dir = useDirection();
  const colour = tint ?? colors.textPrimary;
  const glyph = <Icon name={icon} size={20} color={colour} edge={edge} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={count && !counted ? `${label} (${formatNumber(count, locale)})` : label}
      style={({ pressed }) => [styles.pill, count ? styles.pillCounted : null, { flexDirection: dir.row }, pressed && styles.pressed]}
    >
      {burst !== undefined ? (
        <HeartBurst fired={burst} color={colors.like} size={20}>
          {glyph}
        </HeartBurst>
      ) : (
        glyph
      )}
      {count ? <TickCount value={count} color={inkCount ? colors.textPrimary : (tint ?? colors.textPrimary)} /> : null}
    </Pressable>
  );
}

/** The height of a pill's count line, which the old number leaves through and the new one arrives through. */
const COUNT_LINE = 20;

/**
 * A pill's count ticking: on change the old number slides out and the new one rises in (up for more, down for
 * fewer) on the native driver's standard spring. Under Reduce Motion it just changes.
 */
function TickCount({ value, color }: { value: number; color: string }): React.JSX.Element {
  const { locale } = useI18n();
  const reduce = useReducedMotion();
  const [tick, setTick] = useState<{ now: number; was: number | null; up: boolean }>({ now: value, was: null, up: true });
  const p = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (value === tick.now) return;
    if (reduce) {
      setTick({ now: value, was: null, up: true });
      return;
    }
    setTick({ now: value, was: tick.now, up: value > tick.now });
    p.setValue(0);
    // The count answers a tap on a control used all day: there inside 300 ms, with no bounce.
    const run = springTo(p, 1, 'chrome');
    run.start(({ finished }) => {
      if (finished) setTick((s) => ({ ...s, was: null }));
    });
    return () => run.stop();
    // Once per change of the number; the previous value is read from the tick shown until now.
  }, [value]);
  const sign = tick.up ? 1 : -1;
  const leaving = p.interpolate({ inputRange: [0, 1], outputRange: [0, -sign * COUNT_LINE] });
  const arriving = p.interpolate({ inputRange: [0, 1], outputRange: [sign * COUNT_LINE, 0] });
  const fadeOut = p.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <View style={styles.tick}>
      {tick.was !== null ? (
        <Animated.Text
          style={[styles.count, styles.tickOld, { color, opacity: fadeOut, transform: [{ translateY: leaving }] }]}
          numberOfLines={1}
          maxFontSizeMultiplier={fontScaleCap.fixedBox}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {formatCompact(tick.was, locale)}
        </Animated.Text>
      ) : null}
      <Animated.Text
        style={[styles.count, { color, opacity: p, transform: [{ translateY: arriving }] }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={COUNT_FIT}
        maxFontSizeMultiplier={fontScaleCap.fixedBox}
      >
        {formatCompact(tick.now, locale)}
      </Animated.Text>
    </View>
  );
}

/**
 * How far a pill's count may shrink: only three of the longest short forms ("12,3 Tsd.") beside a gift, share and
 * save on a 360 pt phone need it.
 */
const COUNT_FIT = 0.5;

const styles = StyleSheet.create({
  // No box: a hairline across the page under each post, the same room above and below it.
  post: { paddingTop: spacing.sm + 4, paddingBottom: spacing.sm + 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter, marginBottom: spacing.sm },
  /* Author, kind and time on one line where they fit; otherwise kind and time wrap under the name rather than truncating it. */
  byline: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 },
  whoLink: { flexShrink: 1 },
  who: { flexShrink: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  meta: { flexShrink: 1, fontSize: typography.sizes.text },
  more: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginVertical: -6, marginEnd: -spacing.sm - 2 },
  // The 12 between a post's content and its pills is split between them, so the pills reach into a gap of their own (ACTIONS_ABOVE).
  words: { paddingHorizontal: layout.gutter, gap: 6, paddingBottom: spacing.xs + 2 },
  title: { fontSize: TITLE_SIZE, lineHeight: TITLE_LINE, fontWeight: typography.weights.bold },
  excerpt: { fontSize: typography.sizes.text, lineHeight: 23 },
  pictures: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xs + 2 },
  held: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  bloomLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter, paddingTop: spacing.xs + 2 },
  // The row's gap either side of it counts once, which leaves room for one more digit when the counts are long.
  spacer: { flex: 1, marginHorizontal: -spacing.sm / 2 },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minWidth: PILL, height: PILL },
  // A pill with a count gives way first when the row is short of room, never below a round pill's width.
  pillCounted: { flexShrink: 1 },
  pressed: { opacity: pressedDim },
  count: { fontSize: typography.sizes.text, lineHeight: COUNT_LINE, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  // The count's window: one line tall, so a number sliding out is gone at its edge, and as narrow as the pill allows.
  tick: { flexShrink: 1, minWidth: 0, height: COUNT_LINE, overflow: 'hidden', justifyContent: 'center' },
  tickOld: { position: 'absolute', left: 0, right: 0 },
});
