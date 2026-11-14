import { useEffect, useId, useMemo, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { badgeSvg, gameEmblemSvg, leagueEmblemSvg, letterEnvelopeSvg, type NoticePicture } from '@kurda/shared';
import MASCOT from '../../assets/mascot-deer.png';
import { PressableScale, Rise } from '../theme/MotionParts';
import { useI18n } from '../i18n/I18nContext';
import { InitialsAvatar } from '../profile/InitialsAvatar';
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
  /** when it came, short: "6m", "20h", a date */
  time: string;
  unread: boolean;
  actor: NoticeActor | null;
  kind: NoticeKind;
  /** what it is about, drawn at the row's end, where it can be drawn */
  picture: NoticePicture | null;
  /** what a screen reader hears for the whole row */
  label: string;
  onPress: () => void;
  /** the one thing that can be done from the row itself, where the app already does it (join a game, open a gift) */
  action?: { label: string; onPress: () => void } | null;
  /** pulled open on what is under it; one row at a time, which the list keeps */
  open: boolean;
  /** taken away, and on its way out of the list */
  leaving: boolean;
  /** when it rises into the list as the list arrives, or null to simply be there */
  enter: number | null;
  onOpen: (open: boolean) => void;
  onRemove: () => void;
  /** its way out is over: the list can let it go */
  onGone: () => void;
  onTouch: () => void;
  onSwiping: (swiping: boolean) => void;
  onSettings: () => void;
}

/** How long the warm wash under a new one takes to fade once it has been read: the website's 420 ms. */
const WASH_FADE_MS = 420;

/**
 * A notification: who it is from at its start — their face, or Hevalo's own
 * mark for news from Hevalo, with what kind of thing it is on the corner —
 * what happened in the reader's words with the time after them, and at its end
 * a picture of what it is about where there is one: the badge, the league, the
 * game, the letter, the gift, the streak's fire.
 *
 * New is said three ways and never by colour alone: a small gold dot at its
 * start, a warm wash across the row (the sun's gold, faintly — the one warm
 * thing in the list), and "Unread" in what a screen reader hears. Once read,
 * the wash and the dot fade rather than vanish.
 *
 * Pulled toward its start by a finger it slides open on the notification
 * settings and the way to take it away; pulled most of the way across it goes
 * at once. Held down it opens the same way, and a screen reader is offered
 * taking it away as one of the row's actions, beside the inline one (Join,
 * Open), which it would otherwise never reach inside the row.
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
   * A line in the reader's own right-to-left words is read that way even when
   * it starts with a name in Latin letters ("Azad …"), which would otherwise
   * turn the whole line round; the server's English, on a Soranî screen,
   * still reads left to right.
   */
  const titleDir = dir.rtl && RTL_SCRIPT.test(title) ? dir.text : dir.free;

  // the wash and the dot are one value, so they fade out together as the row is read
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

  // gold at a tenth, as the website mixes it; the face's ring is the same colour made solid, so the badge sits on the row
  const wash = `${colors.gold}1A`;
  const ring = unread ? blend(colors.gold, colors.background, 0.1) : colors.background;
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
              style={[styles.dot, mirrored ? styles.dotRight : styles.dotLeft, { backgroundColor: colors.gold, opacity: fresh, transform: [{ scale: fresh }] }]}
            />
            <Pressable
              onPress={() => {
                // the end of a pull is not a tap
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
                  {/*
                   * after the words, on their line, quieter than them: kept in one piece so "6 Min." never breaks, and
                   * set apart from the words beside it, so a time in Arabic letters never joins a name in Latin ones
                   */}
                  <Text style={[styles.time, { color: colors.textSecondary }]}>{` \u2068${time.replace(/ /g, '\u00a0')}\u2069`}</Text>
                </Text>
                {body ? (
                  <Text style={[styles.body, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
                    {body}
                  </Text>
                ) : null}
                {action ? (
                  <View style={[styles.actionRow, { flexDirection: dir.row }]}>
                    <PressableScale
                      onPress={action.onPress}
                      accessibilityRole="button"
                      accessibilityLabel={action.label}
                      hitSlop={(MIN_TOUCH_TARGET - ACTION_HEIGHT) / 2}
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
 * What a finger finds under a row as it pulls it aside: the notification
 * settings, in grey, and taking it away, in red, at the row's end.
 *
 * Red runs under the whole row, so a row pulled past what it opens to shows
 * only more red, and the settings ride along at the row's edge, fading as it
 * nears the point where letting go takes it away: all red then says what will
 * happen. Only drawn while the row is pulled, open or leaving, and only
 * offered to a screen reader while it is open.
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
          // solid, not the track's own see-through grey: the red runs under it
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
 * Who it is from: their face, or Hevalo's own mark for news from Hevalo, as
 * somebody's face would be — with what they did in a small badge on the
 * corner. An invite's badge is its ticket, in its game's colour, filled the
 * way the ticket's stub is.
 */
function Face({ actor, kind, ring, mirrored }: { actor: NoticeActor | null; kind: NoticeKind; ring: string; mirrored: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const stub = kind.game ? ticketTone(colors, kind.game) : null;
  return (
    <View style={styles.face} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {actor ? (
        <InitialsAvatar name={actor.name} id={actor.id} size={NOTICE.avatar} photoUrl={actor.photoUrl} />
      ) : (
        <View style={[styles.hevalo, { backgroundColor: colors.surface }]} testID="notice-from-hevalo">
          <Image source={MASCOT} style={styles.deer} resizeMode="contain" />
        </View>
      )}
      {/* ringed in whatever the row is drawn on, so it reads as sitting on the face rather than cut into it */}
      <View style={[styles.badge, mirrored ? styles.badgeLeft : styles.badgeRight, { backgroundColor: stub ? stub.face : colors.primary, borderColor: ring }]}>
        <Icon name={kind.icon} size={11} color={stub ? stub.ink : colors.textOnPrimary} />
      </View>
    </View>
  );
}

/**
 * What it is about, drawn small at the row's end: the same drawings the
 * website shows (shared art, drawn at twice the size and fitted, so the
 * detail holds), the gift's own wrapping, and the streak's fire standing
 * still. Decoration: the row's words already say what it is.
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
 * The list while it loads: the same heading and the same rows, in grey, as
 * many as the screen holds — so nothing moves when the real ones arrive.
 */
export function NotificationListSkeleton(): React.JSX.Element {
  const { height } = useWindowDimensions();
  const { t } = useI18n();
  const dir = useDirection();
  // enough rows to reach the foot of the screen, whatever its height
  const count = Math.max(4, Math.ceil(height / NOTICE_ROW_HEIGHT));
  const widths = ['78%', '64%', '86%', '58%', '72%'] as const;
  // the bars start where the words will, which in Soranî is on the right
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
          {/* most notifications have a picture at their end; a few do not */}
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
          <Text style={[styles.markAllText, { color: colors.textPrimary }]} numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // the same column the list draws, so the rows land where the grey ones stood
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
  // in the gutter, halfway between the screen's edge and the face
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
  title: { fontSize: typography.sizes.sm, lineHeight: NOTICE.titleLine },
  titleUnread: { fontWeight: typography.weights.medium },
  name: { fontWeight: typography.weights.bold },
  time: { fontWeight: typography.weights.regular },
  body: { fontSize: typography.sizes.xs, lineHeight: NOTICE.bodyLine },
  actionRow: { marginTop: spacing.xs },
  action: { minHeight: ACTION_HEIGHT, paddingHorizontal: spacing.md, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  picture: { width: NOTICE.picture, height: NOTICE.picture, borderRadius: radii.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  underButton: { position: 'absolute', top: 0, bottom: 0, width: UNDER_BUTTON, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  atRight: { right: 0 },
  atLeft: { left: 0 },
  underSettings: { position: 'absolute', top: 0, bottom: 0, width: UNDER_BUTTON },
  besideRight: { right: UNDER_BUTTON },
  besideLeft: { left: UNDER_BUTTON },
  underFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  underText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
  // each bar centred on the line it stands in for
  titleBar: { height: NOTICE.titleLine, justifyContent: 'center' },
  bodyBar: { height: NOTICE.bodyLine, justifyContent: 'center' },
  heading: { minHeight: NOTICE.heading, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: NOTICE.padH, gap: spacing.md },
  headingLater: { marginTop: spacing.sm },
  headingText: { ...sectionLabel, flexShrink: 1 },
  markAll: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  markAllText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  pressed: { opacity: pressedDim },
});
