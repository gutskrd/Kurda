import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Animated, Share, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
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
import { layout, radii, spacing, typography } from '../theme/tokens';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { noticeTime } from '../notifications/inbox';
import { formatCompact, formatNumber } from '../i18n/format';
import type { Locale } from '../i18n/translations';
import { springTo, timing } from '../theme/animate';
import { useDirection } from '../reports/direction';
import { postUrl, setEngagement } from './api';
import { CARD_LABEL_KEY, feedImages, type EngagementKind, type FeedItem, type PostEngagement } from './types';
import { PostPictures } from '../composer/PostPictures';
import { usePostMenu } from '../composer/PostExtras';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { ReportSheet } from '../reports/ReportSheet';
import { pressedDim } from '../theme/motion';

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

/**
 * One post on the wall, written or a picture, in one shape: a header line (author, kind, age, "⋯"), the text, the
 * pictures, and a row of pills (like, comments, repost, share, save). A double tap likes with a blooming heart; a
 * single tap opens the post. Like, repost and save are shown at once (api/optimistic.ts), each on its own, and go back
 * with a short message on refusal; guests are offered an account first (auth/AccountGate). `standalone` is the post on its own page.
 * Memoised, since liking one post re-renders the wall.
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
  const { client } = useAuth();
  // A guest reads the wall; liking, reposting and saving are the account's (auth/AccountGate).
  const { require } = useAccountGate();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  // Each like made here, so the heart answers the press before the server does.
  const [likes, setLikes] = useState(0);
  // Each like made by a double tap, for the heart in the middle of the post.
  const [blooms, setBlooms] = useState(0);
  // The engagement as the server last told it: the item's, or a fresher answer to a tap here.
  const [told, setTold] = useState(item.engagement);
  const [reporting, setReporting] = useState(false);
  useEffect(() => setTold(item.engagement), [item.engagement]);

  const open = useCallback(() => {
    if (standalone) return;
    if (item.targetType === 'library') navigation.navigate('LibraryPost', { postId: item.id });
    else navigation.navigate('MemeDetail', { postId: item.id });
  }, [navigation, item.targetType, item.id, standalone]);
  // Your own post's Edit and Delete, on a long press, the "⋯" (and as an action for a screen reader).
  const menu = usePostMenu({ targetType: item.targetType, id: item.id, authorId: item.author.id }, { onDeleted, onActivate: open });
  const openAuthor = useCallback(() => navigation.navigate('UserProfile', { userId: item.author.id }), [navigation, item.author.id]);

  /*
   * Like, repost and save are each shown at once and sent on their own; the server's answer brings the true totals.
   * What is drawn is its last answer with each change still on its way laid over it.
   */
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
      if (!shown.liked) like();
      return;
    }
    lastTap.current = now;
    single.current = setTimeout(() => {
      single.current = null;
      open();
    }, DOUBLE_TAP_MS);
  }, [like, open, shown.liked, require]);

  /** Hand the post to the system share sheet. */
  const share = useCallback(async () => {
    const url = postUrl(item);
    const message = item.title ? `${item.title}\n${url}` : url;
    try {
      await Share.share({ message, url });
    } catch {
      // The sheet was dismissed or the platform refused it; nothing was shared.
    }
  }, [item]);

  // An unfamiliar kind prints itself rather than an empty word.
  const badgeKey = CARD_LABEL_KEY[item.kind];
  const badge = badgeKey ? t(badgeKey) : item.kind;
  const who = item.author.displayName || item.author.username;
  const e = shown;
  const pictures = feedImages(item);
  const when = noticeTime(item.at, t, locale);
  const count = (n: number): number | undefined => (n > 0 ? n : undefined);
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
          <Pressable
            onPress={openAuthor}
            accessibilityRole="button"
            accessibilityLabel={who}
            reachSize={{ width: AUTHOR, height: AUTHOR }}
            style={({ pressed }) => pressed && heldDim}
          >
            <Avatar name={who} size={AUTHOR} photoUrl={item.author.avatarUrl} />
          </Pressable>
          <View style={[styles.byline, { flexDirection: dir.row }]}>
            {/* A control of its own, since a pressable run of text cannot reach past its letters. */}
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

      <View style={[styles.actions, { flexDirection: dir.row }]}>
        {/* The pills share the row's gap between them, and the 12 above them with what they are under. */}
        <ReachGroup gap={spacing.sm} rowGap={ACTIONS_ABOVE}>
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
            onPress={() => act('repost')}
          />
          <View style={styles.spacer} />
          {/* Sharing has its own glyph: the paper plane means Messages and Send, and a post is not sent to anyone here. */}
          <Action icon="share" label={t('share.post')} onPress={() => void share()} />
          <Action
            icon={e.bookmarked ? 'bookmark-fill' : 'bookmark'}
            on={e.bookmarked}
            label={e.bookmarked ? t('feed.removeFromSaved') : t('feed.save')}
            onPress={() => act('bookmark')}
          />
        </ReachGroup>
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
          <Icon name="heart-fill" size={92} color={colors.danger} />
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
          <SkeletonText size={typography.sizes.sm} width="46%" />
        </View>
      </View>
      <View style={styles.words}>
        {titled ? <SkeletonText size={TITLE_SIZE} lineHeight={TITLE_LINE} width="62%" /> : null}
        {/* One paragraph, its lines with nothing between them. */}
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
const TITLE_SIZE = 19;
const TITLE_LINE = 25;
/**
 * A pill's height and a round pill's width: drawn at 36 and reaching 48 up and down; across, the row's 8 gap is
 * shared between neighbours, so 44.
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
 * One soft pill under a post: a 20 pt glyph and its count, or a round button of the same height without one.
 * Filled, not framed, and no different when on; the glyph shows that (a red heart, a green repost, a filled
 * bookmark). The label says what pressing does, never the count, since a screen reader would otherwise announce
 * the number as its name.
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
  /** The colour while on, when it is not the ink (a red heart, a green repost). */
  tint?: string;
  /** Goes up each time the icon should pop with a burst (a like). */
  burst?: number;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const colour = tint ?? colors.textPrimary;
  const glyph = <Icon name={icon} size={20} color={colour} />;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={count ? `${label} (${count})` : label}
      style={({ pressed }) => [styles.pill, count ? styles.pillWide : null, { backgroundColor: colors.controlTrack }, pressed && styles.pressed]}
    >
      {burst !== undefined ? (
        <HeartBurst fired={burst} color={colors.danger} size={20}>
          {glyph}
        </HeartBurst>
      ) : (
        glyph
      )}
      {count ? <TickCount value={count} color={tint ?? colors.textPrimary} /> : null}
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
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {pillCount(tick.was, locale)}
        </Animated.Text>
      ) : null}
      <Animated.Text style={[styles.count, { color, opacity: p, transform: [{ translateY: arriving }] }]}>{pillCount(tick.now, locale)}</Animated.Text>
    </View>
  );
}

/** A count in a pill: whole up to 9,999, then short ("12.3K"), so five pills fit across a phone, as on the web. */
export function pillCount(n: number, locale: Locale): string {
  return n < 10_000 ? formatNumber(n, locale) : formatCompact(n, locale);
}

const styles = StyleSheet.create({
  // No box: a hairline across the page under each post, the same room above and below it.
  post: { paddingTop: spacing.sm + 4, paddingBottom: spacing.sm + 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter, marginBottom: spacing.sm },
  /* Author, kind and time on one line where they fit; otherwise kind and time wrap under the name rather than truncating it. */
  byline: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 6 },
  whoLink: { flexShrink: 1 },
  who: { flexShrink: 1, fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  meta: { flexShrink: 1, fontSize: typography.sizes.sm },
  more: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center', marginVertical: -6, marginEnd: -spacing.sm - 2 },
  // The 12 between a post's content and its pills is split between them, so the pills reach into a gap of their own (ACTIONS_ABOVE).
  words: { paddingHorizontal: layout.gutter, gap: 6, paddingBottom: spacing.xs + 2 },
  title: { fontSize: TITLE_SIZE, lineHeight: TITLE_LINE, fontWeight: typography.weights.bold },
  excerpt: { fontSize: typography.sizes.md, lineHeight: 23 },
  pictures: { paddingHorizontal: layout.gutter, paddingBottom: spacing.xs + 2 },
  bloomLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: layout.gutter, paddingTop: spacing.xs + 2 },
  spacer: { flex: 1 },
  pill: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: PILL, height: PILL, borderRadius: radii.pill },
  pillWide: { paddingHorizontal: spacing.sm + 4 },
  pressed: { opacity: pressedDim },
  count: { fontSize: typography.sizes.sm, lineHeight: COUNT_LINE, fontWeight: typography.weights.semibold, fontVariant: ['tabular-nums'] },
  // The count's window: one line tall, so a number sliding out is gone at its edge.
  tick: { height: COUNT_LINE, overflow: 'hidden', justifyContent: 'center' },
  tickOld: { position: 'absolute', left: 0, right: 0 },
});
