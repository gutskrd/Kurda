import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { PressableScale } from '../theme/MotionParts';
import { useI18n } from '../i18n/I18nContext';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { Icon } from '../theme/Icon';
import { Skeleton } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { splitName, type NoticeActor } from './inbox';
import { NOTICE, NOTICE_ROW_HEIGHT } from './rowMetrics';
import type { IconName } from '../theme/icon-paths';

export interface NoticeRowProps {
  title: string;
  body: string;
  time: string;
  unread: boolean;
  actor: NoticeActor | null;
  kind: { icon: IconName; reward: boolean };
  /** what a screen reader hears for the whole row */
  label: string;
  onPress: () => void;
  /** the one thing that can be done from the row itself, where the app already does it (join a game, open a gift) */
  action?: { label: string; onPress: () => void } | null;
}

/**
 * A notification: who or what it is from, what happened, when, and whether it
 * has been seen.
 *
 * Unread is said three ways and never by colour alone: a dot at the end, a
 * tinted ground under the row, and "Unread" in what a screen reader hears.
 *
 * The inline action is a button of its own for a fingertip, and a named
 * action of the row for a screen reader, which reads the row as one element
 * and would otherwise never reach a button inside it.
 */
export function NotificationRow({ title, body, time, unread, actor, kind, label, onPress, action }: NoticeRowProps): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const ground = unread ? colors.surface : 'transparent';
  const line = splitName(title, actor?.name);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityActions={action ? [{ name: 'activate' }, { name: 'act', label: action.label }] : undefined}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'act') action?.onPress();
        else onPress();
      }}
      style={({ pressed }) => [styles.row, { flexDirection: dir.row, backgroundColor: pressed ? colors.controlTrack : ground }]}
    >
      <Picture actor={actor} kind={kind} ring={unread ? colors.surface : colors.background} mirrored={dir.row === 'row-reverse'} />
      <View style={styles.main}>
        <Text style={[styles.title, dir.free, { color: colors.textPrimary }]} numberOfLines={2}>
          {line.before}
          {line.name ? <Text style={styles.name}>{line.name}</Text> : null}
          {line.after}
        </Text>
        {body ? (
          <Text style={[styles.body, dir.free, { color: colors.textSecondary }]} numberOfLines={2}>
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
      {/* at the row's far edge, which in Soranî is the left */}
      <View style={[styles.trail, dir.row === 'row-reverse' && styles.trailMirrored]}>
        <Text style={[styles.time, { color: colors.textSecondary }]} numberOfLines={1}>
          {time}
        </Text>
        {/* the dot is the visible half of "unread"; the tint is the other, and the label says it in words */}
        <View style={[styles.dot, { backgroundColor: unread ? colors.goldText : 'transparent' }]} />
      </View>
    </Pressable>
  );
}

const ACTION_HEIGHT = 32;

/**
 * The picture: the person it is from, with what they did in a small badge on
 * the corner — or, when it is from Hevalo or from nobody the data names, the
 * kind itself, large, on a neutral disc.
 */
function Picture({ actor, kind, ring, mirrored }: { actor: NoticeActor | null; kind: { icon: IconName; reward: boolean }; ring: string; mirrored: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const tint = kind.reward ? colors.goldText : colors.textPrimary;
  if (!actor) {
    return (
      <View style={[styles.tile, { backgroundColor: colors.controlTrack }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Icon name={kind.icon} size={22} color={tint} />
      </View>
    );
  }
  return (
    <View style={styles.picture} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <InitialsAvatar name={actor.name} id={actor.id} size={NOTICE.avatar} photoUrl={actor.photoUrl} />
      {/* ringed in whatever the row is drawn on, so it reads as sitting on the picture rather than cut into it */}
      <View style={[styles.badge, mirrored ? styles.badgeLeft : styles.badgeRight, { backgroundColor: colors.primary, borderColor: ring }]}>
        <Icon name={kind.icon} size={11} color={colors.textOnPrimary} />
      </View>
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
  const count = Math.max(4, Math.ceil(height / (NOTICE_ROW_HEIGHT + NOTICE.rowGap)));
  const widths = ['78%', '64%', '86%', '58%', '72%'] as const;
  // the bars start where the words will, which in Soranî is on the right
  const start = { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' } as const;
  return (
    <View style={styles.column} accessibilityLabel={t('common.loading')}>
      <View style={[styles.heading, { flexDirection: dir.row }]}>
        <Skeleton width={64} height={12} />
      </View>
      <View style={styles.rows}>
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
            <View style={[styles.trail, dir.row === 'row-reverse' && styles.trailMirrored]}>
              <View style={styles.timeBar}>
                <Skeleton width={44} height={10} />
              </View>
            </View>
          </View>
        ))}
      </View>
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
  /*
   * The list's own inset is half the gutter, and the row's is the other half:
   * the words sit on the 16pt gutter like every other screen's, and an unread
   * row's tint reaches a little past them, the way a selected row does.
   */
  column: { width: '100%', maxWidth: layout.column, alignSelf: 'center', paddingHorizontal: layout.gutter - NOTICE.padH },
  rows: { gap: NOTICE.rowGap },
  row: {
    alignItems: 'flex-start',
    gap: NOTICE.gap,
    borderRadius: radii.md,
    paddingHorizontal: NOTICE.padH,
    paddingVertical: NOTICE.padV,
  },
  picture: { width: NOTICE.avatar, height: NOTICE.avatar },
  tile: { width: NOTICE.avatar, height: NOTICE.avatar, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    bottom: -2,
    width: NOTICE.badge,
    height: NOTICE.badge,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRight: { right: -4 },
  badgeLeft: { left: -4 },
  main: { flex: 1, gap: NOTICE.lineGap, minHeight: NOTICE.avatar },
  title: { fontSize: typography.sizes.md, lineHeight: NOTICE.titleLine },
  name: { fontWeight: typography.weights.semibold },
  body: { fontSize: typography.sizes.sm, lineHeight: NOTICE.bodyLine },
  actionRow: { marginTop: spacing.sm },
  action: { minHeight: ACTION_HEIGHT, paddingHorizontal: spacing.md, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  trail: { alignItems: 'flex-end', gap: spacing.sm, minWidth: 36 },
  trailMirrored: { alignItems: 'flex-start' },
  time: { fontSize: typography.sizes.xs, lineHeight: NOTICE.titleLine },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
  // each bar centred on the line it stands in for
  titleBar: { height: NOTICE.titleLine, justifyContent: 'center' },
  bodyBar: { height: NOTICE.bodyLine, justifyContent: 'center' },
  timeBar: { height: NOTICE.titleLine, justifyContent: 'center' },
  heading: { minHeight: NOTICE.heading, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: NOTICE.padH, gap: spacing.md },
  headingLater: { marginTop: spacing.sm },
  headingText: { ...sectionLabel, flexShrink: 1 },
  markAll: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  markAllText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  pressed: { opacity: 0.6 },
});
