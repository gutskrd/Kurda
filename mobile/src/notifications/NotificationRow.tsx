import { useEffect, useId, useMemo, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { SvgXml } from 'react-native-svg';
import { badgeSvg, gameEmblemSvg, leagueEmblemSvg, letterEnvelopeSvg, type NoticePicture } from '@kurda/shared';
import MASCOT from '../../assets/mascot-deer.png';
import { PressableScale, Rise } from '../theme/MotionParts';
import { useI18n } from '../i18n/I18nContext';
import { Avatar } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { Fire } from '../theme/Fire';
import { GiftBox } from '../gifts/art';
import { Icon } from '../theme/Icon';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { blend } from '../theme/tileTones';
import { timing } from '../theme/animate';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ticketTone } from '../play/Ticket';
import { splitName, type NoticeActor, type NoticeKind } from './inbox';
import { NOTICE, NOTICE_ROW_HEIGHT } from './rowMetrics';
import { SWIPE } from './swipe';
import { useRowSwipe } from './useRowSwipe';
import { pressedDim } from '../theme/motion';

export interface NoticeRowProps {
  title: string;
  body: string;
  /** When it came, short: "6m", "20h", a date. */
  time: string;
  unread: boolean;
  actor: NoticeActor | null;
  kind: NoticeKind;
  /** What it is about, drawn at the row's end, where it can be drawn. */
  picture: NoticePicture | null;
  /** What a screen reader hears for the whole row. */
  label: string;
  onPress: () => void;
  /** The one thing doable from the row itself, where the app already does it (join a game, open a gift). */
  action?: { label: string; onPress: () => void } | null;
  /** Pulled open on what is under it; one row at a time, which the list keeps. */
  open: boolean;
  /** Taken away, and on its way out of the list. */
  leaving: boolean;
  /** When it rises into the list as the list arrives, or null to simply be there. */
  enter: number | null;
  onOpen: (open: boolean) => void;
  onRemove: () => void;
  /** Its way out is over: the list can let it go. */
  onGone: () => void;
  onTouch: () => void;
  onSwiping: (swiping: boolean) => void;
  onSettings: () => void;
}

/** How long the wash under a new one takes to fade once read: the website's 420 ms. */
const WASH_FADE_MS = 420;

/**
 * A notification: who it is from at its start (their face, or Hevalo's mark, with a badge for the kind), what happened
 * with the time after it, and at its end a picture of what it is about where there is one.
 *
 * New is shown three ways, never by colour alone: a violet dot, a faint violet wash across the row, and "Unread" for a
 * screen reader; both fade once read. Pulled toward its start it slides open on the settings and Delete, and pulled
 * most of the way across it goes at once. A long press opens it too, and a screen reader is offered Delete as an action
 * beside the inline one (Join, Open), which it could not otherwise reach.
 */
export function NotificationRow(props: NoticeRowProps): React.JSX.Element {
  const { title, body, time, unread, actor, kind, picture, label, onPress, action, open, leaving, enter, onOpen, onRemove, onSettings } = props;
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const mirrored = dir.row === 'row-reverse';
  const swipe = useRowSwipe({
    open,
    leaving,
    sign: dir.rtl ? -1 : 1,
    onOpen,
    onRemove,
    onGone: props.onGone,
    onTouch: props.onTouch,
    onSwiping: props.onSwiping,
  });
  const line = splitName(title, actor?.name);
  /*
   * A line in the reader's right-to-left words reads that way even when it starts with a Latin-letter name, which would
   * otherwise flip it; the server's English on a Soranî screen still reads left to right.
   */
  const titleDir = dir.rtl && RTL_SCRIPT.test(title) ? dir.text : dir.free;

  // The wash and the dot are one value, so they fade out together as the row is read.
  const fresh = useRef(new Animated.Value(unread ? 1 : 0)).current;
  useEffect(() => {
    const to = unread ? 1 : 0;
    if (reduce) {
      fresh.setValue(to);
      return;
    }
    const run = timing(fresh, to, WASH_FADE_MS);
    run.start();
    return () => run.stop();
  }, [unread, reduce, fresh]);

  // The app's violet at a tenth, as the website mixes it; the face's ring is the same colour made solid.
  const wash = `${colors.primary}1A`;
  const ring = unread ? blend(colors.primary, colors.background, 0.1) : colors.background;
  const deleteWhat = t('notifications.deleteWhat', { what: title });

  return (
    <Animated.View onLayout={swipe.onRowLayout} style={swipe.height ? { height: swipe.height, overflow: 'hidden' } : null}>
      <Rise delay={enter}>
        <View style={styles.box} onLayout={swipe.onBoxLayout}>
          {swipe.exposed ? <Under offset={swipe.offset} width={swipe.width} open={open} mirrored={mirrored} deleteLabel={deleteWhat} onSettings={onSettings} onDelete={onRemove} /> : null}
          <Animated.View
            {...swipe.panHandlers}
            style={[styles.slide, { backgroundColor: swipe.exposed ? colors.background : 'transparent', transform: [{ translateX: swipe.translateX }] }]}
          >
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: wash, opacity: fresh }]} />
            <Animated.View
              pointerEvents="none"
              style={[styles.dot, mirrored ? styles.dotRight : styles.dotLeft, { backgroundColor: colors.primary, opacity: fresh, transform: [{ scale: fresh }] }]}
            />
            <Pressable
              onPress={() => {
                // The end of a pull is not a tap.
                if (!swipe.pulled()) onPress();
              }}
              onLongPress={() => {
                if (open || leaving) return;
                onOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityActions={[{ name: 'activate' }, ...(action ? [{ name: 'act', label: action.label }] : []), { name: 'delete', label: t('notifications.delete') }]}
              onAccessibilityAction={(e) => {
                const name = e.nativeEvent.actionName;
                if (name === 'act') action?.onPress();
                else if (name === 'delete') onRemove();
                else onPress();
              }}
              style={({ pressed }) => [styles.row, { flexDirection: dir.row }, pressed && !open && { backgroundColor: colors.controlTrack }]}
            >
              <Face actor={actor} kind={kind} ring={ring} mirrored={mirrored} />
              <View style={styles.main}>
                <Text style={[styles.title, titleDir, { color: colors.textPrimary }, unread && styles.titleUnread]} numberOfLines={2}>
                  {line.before}
                  {line.name ? <Text style={styles.name}>{line.name}</Text> : null}
                  {line.after}
                  {/* After the words, quieter: kept in one piece so "6 Min." never breaks, and isolated so a time in
                     Arabic letters never joins a Latin name. */}
                  <Text style={[styles.time, { color: colors.textSecondary }]}>{` \u2068${time.replace(/ /g, '\u00a0')}\u2069`}</Text>
                </Text>
                {body ? (
                  <Text style={[styles.body, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
                    {body}
                  </Text>
                ) : null}
                {action ? (
                  <View style={[styles.actionRow, { flexDirection: dir.row }]}>
                    {/* Reaches a fingertip up and down from its 32pt within the row, so a near miss does what the
                       button says rather than opening the notification. */}
                    <PressableScale
                      onPress={action.onPress}
                      accessibilityRole="button"
                      accessibilityLabel={action.label}
                      style={[styles.action, { backgroundColor: colors.primary }]}
                    >
                      <Text style={[styles.actionText, { color: colors.textOnPrimary }]} numberOfLines={1}>
                        {action.label}
                      </Text>
                    </PressableScale>
                  </View>
                ) : null}
              </View>
              {picture ? <NoticeArt picture={picture} /> : null}
            </Pressable>
          </Animated.View>
        </View>
      </Rise>
    </Animated.View>
  );
}

const ACTION_HEIGHT = 32;
/** Letters of a script written right to left: Hebrew, Arabic and its extensions (Soranî's among them), and their presentation forms. */
const RTL_SCRIPT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
/** Each of the two things under a row is half of what it opens to. */
const UNDER_BUTTON = SWIPE.open / 2;

/**
 * What is under a row as it is pulled aside: the settings in grey and Delete in red at the row's end. Red runs under
 * the whole row, so pulling past open shows only more red, and the settings fade as the row nears the point where
 * letting go deletes it. Drawn only while pulled, open or leaving, and offered to a screen reader only while open.
 */
function Under({
  offset,
  width,
  open,
  mirrored,
  deleteLabel,
  onSettings,
  onDelete,
}: {
  offset: Animated.Value;
  width: number;
  open: boolean;
  mirrored: boolean;
  deleteLabel: string;
  onSettings: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const w = Math.max(width, SWIPE.open + 1);
  const away = w * SWIPE.away;
  const sign = mirrored ? -1 : 1;
  const follow = offset.interpolate({ inputRange: [-w, -SWIPE.open, 0], outputRange: [-(w - SWIPE.open) * sign, 0, 0], extrapolate: 'clamp' });
  const fade = offset.interpolate({ inputRange: [-away, -away + 48], outputRange: [0, 1], extrapolate: 'clamp' });
  const end = mirrored ? styles.atLeft : styles.atRight;
  const hidden = open ? null : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.danger }]} pointerEvents={open ? 'box-none' : 'none'} {...hidden}>
      <Pressable
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={deleteLabel}
        style={({ pressed }) => [styles.underButton, end, pressed && styles.pressed]}
      >
        <Icon name="trash" size={20} color={colors.textOnPrimary} />
        <Text style={[styles.underText, { color: colors.textOnPrimary }]} numberOfLines={1}>
          {t('notifications.delete')}
        </Text>
      </Pressable>
      <Animated.View style={[styles.underSettings, mirrored ? styles.besideLeft : styles.besideRight, { opacity: fade, transform: [{ translateX: follow }] }]}>
        <Pressable
          onPress={onSettings}
          accessibilityRole="button"
          accessibilityLabel={t('settings.notifications')}
          // Solid, not the track's see-through grey: the red runs under it.
          style={({ pressed }) => [styles.underFill, { backgroundColor: blend(colors.controlTrack, colors.background) }, pressed && styles.pressed]}
        >
          <Icon name="gear" size={20} color={colors.textPrimary} />
          <Text style={[styles.underText, { color: colors.textPrimary }]} numberOfLines={1}>
            {t('settings.title')}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

/**
 * Who it is from: their face, or Hevalo's mark for news from Hevalo, with what they did in a small corner badge. An
 * invite's badge is its ticket, in its game's colour.
 */
function Face({ actor, kind, ring, mirrored }: { actor: NoticeActor | null; kind: NoticeKind; ring: string; mirrored: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const stub = kind.game ? ticketTone(colors, kind.game) : null;
  return (
    <View style={styles.face} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {actor ? (
        <Avatar name={actor.name} size={NOTICE.avatar} photoUrl={actor.photoUrl} />
      ) : (
        <View style={[styles.hevalo, { backgroundColor: colors.surface }]} testID="notice-from-hevalo">
          <Image source={MASCOT} style={styles.deer} resizeMode="contain" />
        </View>
      )}
      {/* Ringed in whatever the row is drawn on, so it sits on the face rather than cutting into it. */}
      <View style={[styles.badge, mirrored ? styles.badgeLeft : styles.badgeRight, { backgroundColor: stub ? stub.face : colors.primary, borderColor: ring }]}>
        <Icon name={kind.icon} size={11} color={stub ? stub.ink : colors.textOnPrimary} />
      </View>
    </View>
  );
}

/**
 * What it is about, drawn small at the row's end: the website's shared art (drawn at twice the size and fitted, so
 * detail holds), the gift's wrapping, or the streak's still fire. Decoration: the row's words already say it.
 */
function NoticeArt({ picture }: { picture: NoticePicture }): React.JSX.Element {
  const { colors } = useTheme();
  const id = `np${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const xml = useMemo(() => {
    const size = NOTICE.picture * 2;
    switch (picture.kind) {
      case 'badge':
        return badgeSvg({ key: picture.key as Parameters<typeof badgeSvg>[0]['key'], tier: picture.tier, size, idPrefix: id });
      case 'league':
        return leagueEmblemSvg({ tier: picture.tier, size, idPrefix: id });
      case 'game':
        return gameEmblemSvg({ game: picture.game, size, idPrefix: id });
      case 'letter':
        return letterEnvelopeSvg({ size, idPrefix: id });
      default:
        return null;
    }
  }, [picture, id]);
  return (
    <View
      testID={`notice-picture-${picture.kind}`}
      style={[styles.picture, { backgroundColor: colors.controlTrack }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      {xml ? (
        <SvgXml xml={xml} width={NOTICE.picture} height={NOTICE.picture} />
      ) : picture.kind === 'gift' ? (
        <GiftBox size={34} tier="rare" gold={colors.gold} />
      ) : (
        <Fire size={32} level={{ stage: 'campfire', growth: 0.5 }} still />
      )}
    </View>
  );
}

/**
 * The list while it loads: the same heading and rows in grey, as many as the screen holds, so nothing moves when the
 * real ones arrive.
 */
export function NotificationListSkeleton(): React.JSX.Element {
  const { height } = useWindowDimensions();
  const { t } = useI18n();
  const dir = useDirection();
  // Enough rows to reach the foot of the screen, whatever its height.
  const count = Math.max(4, Math.ceil(height / NOTICE_ROW_HEIGHT));
  const widths = ['78%', '64%', '86%', '58%', '72%'] as const;
  // The bars start where the words will, which in right-to-left languages is on the right.
  const start = { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' } as const;
  return (
    <View style={styles.column} accessibilityLabel={t('common.loading')}>
      <View style={[styles.heading, { flexDirection: dir.row }]}>
        <Skeleton width={64} height={12} />
      </View>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.row, { flexDirection: dir.row }]}>
          <Skeleton width={NOTICE.avatar} height={NOTICE.avatar} radius={radii.pill} />
          <View style={styles.main}>
            <View style={[styles.titleBar, start]}>
              <Skeleton width={widths[i % widths.length]} height={14} />
            </View>
            <View style={[styles.bodyBar, start]}>
              <Skeleton width="46%" height={12} />
            </View>
          </View>
          {/* Most notifications have a picture at their end; a few do not. */}
          {i % 3 === 2 ? null : <Skeleton width={NOTICE.picture} height={NOTICE.picture} radius={radii.md} />}
        </View>
      ))}
    </View>
  );
}

/** A stretch's heading — "Today" — and, on the first one, the way to clear them all. */
export function NotificationHeading({ title, first, action }: { title: string; first: boolean; action?: { label: string; onPress: () => void } | null }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.heading, !first && styles.headingLater, { flexDirection: dir.row }]}>
      <Text style={[styles.headingText, dir.text, { color: colors.textSecondary }]} accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label} style={({ pressed }) => [styles.markAll, pressed && styles.pressed]}>
          {/* Violet, as what can be pressed is: it is the one thing on the list's head that does something. */}
          <Text style={[styles.markAllText, { color: colors.primary }]} numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The same column the list draws, so the rows land where the grey ones stood.
  column: { width: '100%', maxWidth: layout.column, alignSelf: 'center' },
  box: { overflow: 'hidden' },
  slide: { width: '100%' },
  row: {
    alignItems: 'center',
    gap: NOTICE.gap,
    minHeight: NOTICE_ROW_HEIGHT,
    paddingHorizontal: NOTICE.padH,
    paddingVertical: NOTICE.padV,
  },
  dot: { position: 'absolute', top: '50%', width: NOTICE.dot, height: NOTICE.dot, marginTop: -NOTICE.dot / 2, borderRadius: radii.pill },
  // In the gutter, halfway between the screen's edge and the face.
  dotLeft: { left: (NOTICE.padH - NOTICE.dot) / 2 },
  dotRight: { right: (NOTICE.padH - NOTICE.dot) / 2 },
  face: { width: NOTICE.avatar, height: NOTICE.avatar },
  hevalo: { width: NOTICE.avatar, height: NOTICE.avatar, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  deer: { width: NOTICE.avatar * 0.8, height: NOTICE.avatar * 0.8 },
  badge: {
    position: 'absolute',
    bottom: -3,
    width: NOTICE.badge,
    height: NOTICE.badge,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRight: { right: -4 },
  badgeLeft: { left: -4 },
  main: { flex: 1, gap: NOTICE.lineGap, justifyContent: 'center' },
  title: { fontSize: typography.sizes.text, lineHeight: NOTICE.titleLine },
  titleUnread: { fontWeight: typography.weights.medium },
  name: { fontWeight: typography.weights.bold },
  time: { fontWeight: typography.weights.regular },
  body: { fontSize: typography.sizes.text, lineHeight: NOTICE.bodyLine },
  actionRow: { marginTop: spacing.xs },
  action: { minHeight: ACTION_HEIGHT, paddingHorizontal: spacing.md, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  picture: { width: NOTICE.picture, height: NOTICE.picture, borderRadius: radii.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  underButton: { position: 'absolute', top: 0, bottom: 0, width: UNDER_BUTTON, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  atRight: { right: 0 },
  atLeft: { left: 0 },
  underSettings: { position: 'absolute', top: 0, bottom: 0, width: UNDER_BUTTON },
  besideRight: { right: UNDER_BUTTON },
  besideLeft: { left: UNDER_BUTTON },
  underFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  underText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  // Each bar centred on the line it stands in for.
  titleBar: { height: NOTICE.titleLine, justifyContent: 'center' },
  bodyBar: { height: NOTICE.bodyLine, justifyContent: 'center' },
  heading: { minHeight: NOTICE.heading, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: NOTICE.padH, gap: spacing.md },
  headingLater: { marginTop: spacing.sm },
  headingText: { ...sectionLabel, flexShrink: 1 },
  markAll: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  markAllText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  pressed: { opacity: pressedDim },
});
