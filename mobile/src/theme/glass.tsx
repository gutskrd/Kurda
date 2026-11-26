import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable, type Reach } from './Pressable';
import { LinearGradient } from 'expo-linear-gradient';
import { fontScaleCap, radii, spacing, typography } from './tokens';
import { MIN_REACH, MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from './ThemeProvider';
import { Icon, type IconName } from './Icon';
import { useI18n } from '../i18n/I18nContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useDirection } from '../reports/direction';
import { haptic } from '../feedback/haptics';
import { springTo, usePressSink } from './animate';
import { pressedDim } from './motion';
import { heldRow, heldDim } from './MotionParts';
import { EmptyState } from './EmptyState';

/** A screen's full-bleed gradient background. */
export function GradientBackground({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, style]}>
      {children}
    </LinearGradient>
  );
}

/** A card: a fill light enough to read text off, with no blur or stroke; by night a faint warm light along its top edge lifts it off the page. */
export function GlassCard({
  children,
  style,
  contentStyle,
  padding = 'regular',
}: {
  children: ReactNode;
  /** The card's place among its neighbours (margins, width, flex). It styles the outer shadow, so layout for the contents goes in `contentStyle`. */
  style?: StyleProp<ViewStyle>;
  /** How the card lays out its contents: alignment, gaps, a row. */
  contentStyle?: StyleProp<ViewStyle>;
  /** 'tight' trims the vertical padding for dense row lists (Settings). */
  padding?: 'regular' | 'tight';
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.shadow, { shadowColor: colors.softShadow }, style]}>
      <View style={styles.clip}>
        <View style={[styles.glassFace, padding === 'tight' && styles.glassFaceTight, { backgroundColor: colors.glassFill }, contentStyle]}>
          {children}
        </View>
        {colors.scheme === 'dark' ? <View pointerEvents="none" style={[styles.rim, { backgroundColor: colors.cardRim }]} /> : null}
      </View>
    </View>
  );
}


/**
 * A settings or list row inside a GlassCard: an optional leading icon, a title with optional subtitle, and a
 * trailing slot (value, chevron, switch or any node), with a 52-point touch target and a subtle press highlight.
 * Rows have no dividers; spacing separates them.
 */
export function GlassRow({
  icon,
  title,
  subtitle,
  value,
  trailing,
  onPress,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  /** Trailing node (chevron, switch, custom). A chevron is implied when onPress is set and no trailing or value is given. */
  trailing?: ReactNode;
  onPress?: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  // The row starts on the reading side: the icon there, the chevron at the far end pointing onward.
  const dir = useDirection();
  const body = (pressed: boolean) => (
    <>
      <View style={[styles.row, { flexDirection: dir.row }, pressed && heldRow(colors.controlTrack)]}>
        {icon ? (
          <View style={styles.rowIcon}>
            <Icon name={icon} size={20} color={colors.primary} />
          </View>
        ) : null}
        <View style={styles.rowMain}>
          {/* A long name wraps to a second line rather than being cut. */}
          <Text style={[styles.rowTitle, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={[styles.rowSubtitle, dir.text, { color: colors.textSecondary }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {value ? <Text style={[styles.rowValue, { color: colors.textSecondary }]} numberOfLines={1}>{value}</Text> : null}
        {trailing ?? (onPress ? <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip} /> : null)}
      </View>
    </>
  );
  if (!onPress) return <View>{body(false)}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}>
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/** What a button is for, and what colour that makes it. */
type ClayTone = 'neutral' | 'primary' | 'success' | 'danger';

/**
 * A button pill's drawn height, for its reach: the pill is a view inside the Pressable, whose own style does not
 * say. A regular one reaches 2 past top and bottom to 48; a large one is already taller.
 */
const CLAY_SIZE = { regular: { height: MIN_TOUCH_TARGET }, large: { height: 50 } } as const;

/** How far a button stands above its lip, and so how far a press pushes it down. */
export const CLAY_LIP = 4;

/** Two #rrggbb colours blended, `t` of the way from `a` to `b`. */
function blend(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number): number => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A chunky button standing on a darker lip: solid in its tone, or outlined in the slate's third step for the quieter
 * of two actions. A press pushes it down into the lip and it springs back up with a little bounce; under Reduce Motion
 * it dims instead.
 */
export function ClayButton({
  label,
  onPress,
  tone = 'neutral',
  variant = 'solid',
  size = 'regular',
  icon,
  badge,
  busy = false,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
  reach,
}: {
  label: string;
  onPress: () => void;
  /** The screen-reader label, where the visible word is not enough (an "Accept" on every row must say whose request). */
  accessibilityLabel?: string;
  /** Neutral unless the button means something: `primary` for a screen's main action (solid, it wears the one accent), success and danger for a lesson's two answers. */
  tone?: ClayTone;
  /** Outlined for the quieter of two side-by-side actions: a slate edge and lip, no fill. */
  variant?: 'solid' | 'outline';
  /** 44 is a fingertip's minimum and right among other controls; a full-width action at a screen's foot gets iOS's 50. */
  size?: 'regular' | 'large';
  /** An icon before the label. */
  icon?: IconName;
  /** A count worth interrupting for, drawn as a pill at the end. */
  badge?: string;
  /**
   * Working on it: a spinner replaces the label and the press is disabled, as iOS does, which reads the same in every
   * language without a second progress word to translate.
   */
  busy?: boolean;
  /** Nothing to press yet: a lesson with no answer typed, a purchase in flight. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** For scripted walks of a screen, where the label changes with the language. */
  testID?: string;
  /** How far past its pill it answers a finger (theme/Pressable.tsx): a fingertip by default, `open` when nothing is near. */
  reach?: Reach;
}): React.JSX.Element {
  const { colors } = useTheme();
  const outline = variant === 'outline';
  // Filled, `primary` wears the accent on its lip; outlined, every tone is drawn in the ink on the slate's edge.
  const SOLID: Record<ClayTone, { fill: string; lip: string; ink: string }> = {
    neutral: { fill: colors.neutralFill, lip: colors.neutralLip, ink: colors.textPrimary },
    primary: { fill: colors.accent, lip: colors.accentLip, ink: colors.textOnAccent },
    success: { fill: colors.success, lip: blend(colors.success, '#000000', 0.38), ink: colors.textOnPrimary },
    danger: { fill: colors.danger, lip: blend(colors.danger, '#000000', 0.38), ink: colors.textOnPrimary },
  };
  const solid = SOLID[tone];
  const fill = outline ? colors.background : solid.fill;
  const lip = outline ? colors.btnEdge : solid.lip;
  const textColor = outline ? (tone === 'success' || tone === 'danger' ? solid.fill : colors.textPrimary) : solid.ink;
  const edge = outline ? colors.btnEdge : solid.fill;
  const off = busy || disabled;
  const press = usePressSink(CLAY_LIP, !off);
  const reduce = useReducedMotion();
  // The icon leads on the reading side, and the badge closes on the far one.
  const dir = useDirection();
  const radius = size === 'large' ? radii.lg : radii.md + 2;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy, disabled: off }}
      testID={testID}
      reach={reach}
      reachSize={CLAY_SIZE[size]}
      style={({ pressed }) => [{ opacity: off ? 0.5 : pressed && reduce ? pressedDim : 1 }, size === 'large' && styles.clayLarge, style]}
    >
      <View style={styles.clayStand}>
        <View style={[styles.clayLip, { backgroundColor: lip, borderRadius: radius }]} />
        <Animated.View
          style={[
            styles.clay,
            size === 'large' && styles.clayLargeFace,
            { flexDirection: dir.row, backgroundColor: fill, borderColor: edge, borderRadius: radius, transform: [{ translateY: press.sink }] },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={textColor} />
          ) : (
            <>
              {icon ? <Icon name={icon} size={20} color={textColor} /> : null}
              <Text style={[styles.clayText, tone === 'primary' && !outline && styles.clayTextMain, { color: textColor }]}>{label}</Text>
            </>
          )}
          {badge ? (
            <View style={[styles.clayBadge, { backgroundColor: colors.gold }]}>
              <Text style={[styles.clayBadgeText, { color: colors.textOnGold }]}>{badge}</Text>
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Pressable>
  );
}

/**
 * A centred "couldn't load, try again" state, shown in place of a screen's content when its fetch fails, so an
 * error reads as one with a retry rather than as an empty state. It wears the same picture and button as being
 * offline, which is the same news for the reader, and never alarms, since it is never the reader's doing.
 */
export function ErrorRetry({
  message,
  onRetry,
  style,
}: {
  message?: string;
  onRetry: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={[styles.errorWrap, style]}>
      <EmptyState art="offline" title={t('net.loadFailed')} body={message ?? t('error.offline')} action={{ label: t('common.retry'), onPress: onRetry }} />
    </View>
  );
}

/** Inset of the sliding capsule from its track's edge. */
const SEG_PAD = 3;

/**
 * A labelled (radio) segment's vertical padding: 11 + an 18-point line + 11 makes 40. Each segment reaches over
 * the track's 3-point ring on to `MIN_REACH`, so the ring answers taps too.
 */
const SEG_PAD_V_TALL = 11;
/** A segment label's line height, set on every label so a segment's height is known before layout for its reach. */
const SEG_LINE = 18;

/**
 * A segmented control: a track and a capsule that slides to the chosen option. The chosen word is the same size as
 * the others, only heavier, and the slide is the only motion: instant under Reduce Motion, mirrored in right-to-left
 * languages. The capsule is a tint of the accent with its word and edge in the accent, as on the website, so the choice
 * reads at a glance in both themes.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labelOf,
  groupLabel,
  size = 'regular',
  wrap = false,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf: (v: T) => string;
  /** What is being chosen ("Questions", "Timer"). Given, the control is a radio group of that name; without it, segments are buttons. */
  groupLabel?: string;
  /**
   * `large` is a fingertip tall (44 with the track's padding). A preset picker (with `groupLabel`) is always that tall;
   * older dense filters keep their height.
   */
  size?: 'regular' | 'large';
  /**
   * A label too long for its segment wraps to a second line, and shrinks slightly only if a word still will not fit.
   * For switches whose words run long in some languages; a label that fits one line is unchanged.
   */
  wrap?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const [box, setBox] = useState({ w: 0, h: 0 });
  const chosen = Math.max(0, options.indexOf(value));
  // The capsule's position, counted from the left whichever way the options run.
  const index = mirrored ? options.length - 1 - chosen : chosen;
  const seg = box.w > 0 ? (box.w - SEG_PAD * 2) / options.length : 0;
  const x = useRef(new Animated.Value(0)).current;
  const padV = groupLabel || size === 'large' ? SEG_PAD_V_TALL : 6;
  /*
   * Each segment's reach differs by side. Vertically it covers the track's ring and continues to 48 (9 for a 30-point
   * segment, 4 for a 40-point one), never less than the ring. Horizontally the end segments cover the ring at their
   * end and the inner ones take nothing, since they touch.
   */
  const reachV = Math.max(SEG_PAD, (MIN_REACH - (padV * 2 + SEG_LINE)) / 2);

  useEffect(() => {
    if (seg <= 0) return;
    const to = SEG_PAD + index * seg;
    if (reduceMotion) {
      x.setValue(to);
      return;
    }
    // The interface's own spring: no bounce, settled within 300 ms.
    springTo(x, to, 'chrome').start();
  }, [index, seg, x, reduceMotion]);

  return (
    <View
      style={[styles.segTrack, { backgroundColor: colors.controlTrack, flexDirection: dir.row }]}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      accessibilityRole={groupLabel ? 'radiogroup' : undefined}
      accessibilityLabel={groupLabel}
    >
      {seg > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segCapsule,
            { width: seg, backgroundColor: colors.chosenFill, borderColor: colors.chosenEdge, transform: [{ translateX: x }] },
          ]}
        />
      ) : null}

      {options.map((opt, i) => {
        const active = opt === value;
        const label = labelOf(opt);
        // The ends as drawn: right to left, the first option is on the right.
        const leftmost = i === (mirrored ? options.length - 1 : 0);
        const rightmost = i === (mirrored ? 0 : options.length - 1);
        return (
          <Pressable
            key={opt}
            onPress={() => {
              // A tick for a change of value, nothing for tapping the current one.
              if (!active) haptic('select');
              onChange(opt);
            }}
            accessibilityRole={groupLabel ? 'radio' : 'button'}
            accessibilityState={groupLabel ? { checked: active } : { selected: active }}
            accessibilityLabel={label}
            hitSlop={{ top: reachV, bottom: reachV, left: leftmost ? SEG_PAD : 0, right: rightmost ? SEG_PAD : 0 }}
            // One line keeps the usual height, and a second adds only its own height.
            style={({ pressed }) => [styles.segItem, wrap ? { minHeight: padV * 2 + SEG_LINE, paddingVertical: SEG_PAD } : { paddingVertical: padV }, pressed && heldDim]}
          >
            <Text
              style={[
                styles.segText,
                { color: active ? colors.chosenInk : colors.textSecondary },
                active && styles.segTextActive,
                wrap && styles.segTextWrap,
              ]}
              numberOfLines={wrap ? 2 : 1}
              // A label slightly too long for its share is set a little smaller rather than cut.
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              // A segment is a share of the control's width, so its label grows only as far as it still fits.
              maxFontSizeMultiplier={fontScaleCap.fixedBox}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // A card sits on the page rather than floating: just enough shadow to lift a near-white card off a near-white page.
  // Sheets and menus, which do float, keep the deeper one.
  shadow: {
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    // Elevation is Android-only; web and iOS use the shadow props above.
    elevation: 1,
  },
  clip: { borderRadius: radii.lg, overflow: 'hidden' },
  rim: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  glassFace: { borderRadius: radii.lg, padding: spacing.lg, overflow: 'hidden' },
  glassFaceTight: { paddingVertical: spacing.xs },

  /** Aligned with the title (the icon column plus its gap) and a fingertip tall, since rows stand right against each other. */
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_REACH, paddingVertical: 13 },
  rowIcon: { width: 26, alignItems: 'center' },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.sizes.text, fontWeight: typography.weights.regular },
  rowSubtitle: { fontSize: typography.sizes.text },
  rowValue: { fontSize: typography.sizes.text },
  // The button stands on its lip: room under the face for it, and the lip the face's shape, set that far down.
  clayStand: { paddingBottom: CLAY_LIP },
  clayLip: { position: 'absolute', left: 0, right: 0, top: CLAY_LIP, bottom: 0 },
  // A flat, round-cornered face in one colour, so a button reads as one on any screen.
  clay: {
    borderWidth: 2,
    // At least a fingertip; taller when the reader's text size wraps the label.
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.xs,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  // 50, which iOS gives a screen's full-width main button.
  clayLarge: { alignSelf: 'stretch' },
  clayLargeFace: { minHeight: CLAY_SIZE.large.height },
  // A label longer than the button wraps inside it, centred.
  clayText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, flexShrink: 1, textAlign: 'center' },
  // The main button's word is as chunky as the button.
  clayTextMain: { fontWeight: typography.weights.bold },
  clayBadge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  clayBadgeText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
  segTrack: { borderRadius: radii.pill, padding: SEG_PAD },
  // Absolute, so it slides independently of the row; a wash rather than a raised fill, since a shadow under a
  // translucent fill shows through as a smudge.
  segCapsule: {
    position: 'absolute',
    borderWidth: 1,
    left: 0,
    top: SEG_PAD,
    bottom: SEG_PAD,
    borderRadius: radii.pill,
  },
  segItem: { flex: 1, paddingVertical: 6, paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium, lineHeight: SEG_LINE },
  segTextActive: { fontWeight: typography.weights.semibold },
  segTextWrap: { textAlign: 'center' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
