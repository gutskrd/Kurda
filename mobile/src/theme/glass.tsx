import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, spacing, typography } from './tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from './ThemeProvider';
import { Icon, type IconName } from './Icon';
import { useI18n } from '../i18n/I18nContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useDirection } from '../reports/direction';
import { haptic } from '../feedback/haptics';
import { usePressScale } from './animate';
import { MenuIn } from './MotionParts';
import { EmptyState } from './EmptyState';

/** Full-bleed spatial gradient backdrop for a screen. */
export function GradientBackground({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.fill, style]}>
      {children}
    </LinearGradient>
  );
}

/**
 * A piece of glass, not a piece of frost.
 *
 * This used to be a backdrop blur, a tint over half opaque, a hairline in a
 * flat grey and a white sheen. The blur is what made it milky, the hairline
 * is what made it a box, and between them the surface stopped being
 * something you could see through.
 *
 * Now it is a fill light enough to read text off, and nothing else at all —
 * no stroke, no sheen, and no rim either. The rim went on here first and it
 * was wrong: a piece of glass with a coloured edge on every card in the app
 * is not glass, it is a border in two colours instead of one. It lives on
 * the segmented control now, which is the only thing here that moves.
 */
export function GlassCard({
  children,
  style,
  padding = 'regular',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 'tight' trims the vertical padding for dense row-lists (Settings). */
  padding?: 'regular' | 'tight';
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.shadow, { shadowColor: colors.softShadow }, style]}>
      <View style={styles.clip}>
        <View style={[styles.glassFace, padding === 'tight' && styles.glassFaceTight, { backgroundColor: colors.glassFill }]}>
          {children}
        </View>
      </View>
    </View>
  );
}


/**
 * A single settings / list row inside a GlassCard (KUR-270 polish). One consistent
 * layout — optional leading icon, a title + optional subtitle, and a trailing slot
 * (value text, chevron, switch, or any node) — with a comfortable ≥52px touch
 * target and a subtle press highlight.
 *
 * No divider between rows. There was one, and it read as a line drawn across
 * the middle of the card — which is what a settings list looks like when the
 * card is opaque and what it must not look like when the card is glass. The
 * spacing does the separating now.
 */
export function GlassRow({
  icon,
  iconColor,
  title,
  subtitle,
  value,
  trailing,
  onPress,
  destructive = false,
}: {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  /** Right-hand node (chevron, Switch, custom). A chevron is implied when onPress is set and no trailing/value is given. */
  trailing?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const titleColor = destructive ? colors.danger : colors.textPrimary;
  const body = (pressed: boolean) => (
    <>
      <View style={[styles.row, pressed && { opacity: 0.6 }]}>
        {icon ? (
          <View style={styles.rowIcon}>
            <Icon name={icon} size={20} color={iconColor ?? (destructive ? colors.danger : colors.primary)} />
          </View>
        ) : null}
        <View style={styles.rowMain}>
          <Text style={[styles.rowTitle, { color: titleColor }]} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {value ? <Text style={[styles.rowValue, { color: colors.textSecondary }]} numberOfLines={1}>{value}</Text> : null}
        {trailing ?? (onPress ? <Icon name="chevron-right" size={16} color={colors.textSecondary} /> : null)}
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
export type ClayTone = 'neutral' | 'primary' | 'accent' | 'success' | 'danger';

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
}: {
  label: string;
  onPress: () => void;
  /**
   * What a screen reader says, where the visible word is not enough on its
   * own — a list of requests has an "Accept" on every row, and each needs to
   * say whose request it accepts.
   */
  accessibilityLabel?: string;
  /**
   * Neutral unless the button means something: the brand for the action a
   * screen is for, accent for a way to earn, success and danger for the two
   * answers a lesson gives back.
   */
  tone?: ClayTone;
  /**
   * Outlined for the quieter of two actions side by side — the tone in the
   * edge and the label, nothing in the fill. Six screens drew that by hand
   * with a 2pt border, which is heavier than anything else in the app.
   */
  variant?: 'solid' | 'outline';
  /**
   * 44 is the minimum a fingertip needs and the right height for a button
   * among other things. A full-width action at the bottom of a screen is the
   * screen, and iOS gives that one 50.
   */
  size?: 'regular' | 'large';
  /** Optional skeuomorphic icon rendered before the label. */
  icon?: IconName;
  /** a count worth interrupting for, drawn as a pill on the right */
  badge?: string;
  /**
   * Working on it.
   *
   * Two screens said so by swapping the word — "Publish" became "Publishing…",
   * "+ Post" became "Uploading…" — which meant writing the progress word twice
   * more in every language, and meant the button still looked pressable while
   * it was not. A spinner in place of the label is what iOS does, says the same
   * thing in every language, and takes the press away while it spins.
   */
  busy?: boolean;
  /** Nothing to press yet — a lesson with no answer typed, a purchase mid-flight. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const TONE: Record<ClayTone, string | null> = {
    neutral: null,
    primary: colors.primary,
    accent: colors.accent,
    success: colors.success,
    danger: colors.danger,
  };
  const toneColor = TONE[tone];
  const outline = variant === 'outline';
  const fill = outline ? 'transparent' : (toneColor ?? colors.controlTrack);
  const textColor = outline
    ? (toneColor ?? colors.textPrimary)
    : toneColor
      ? colors.textOnPrimary
      : colors.textPrimary;
  // the outline variant has no fill, so its rim is the whole button; a filled
  // one already has a shape and a rim round it is just a rim
  const edge = outline ? (toneColor ?? colors.glassBorder) : 'transparent';
  const off = busy || disabled;
  // gives a little under the finger and springs back (animate.ts); still under Reduce Motion
  const press = usePressScale(!off);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ busy, disabled: off }}
      style={({ pressed }) => [{ opacity: off ? 0.5 : pressed ? 0.92 : 1 }, style]}
    >
      <Animated.View
        style={[
          styles.clay,
          size === 'large' && styles.clayLarge,
          { backgroundColor: fill, borderColor: edge, transform: [{ scale: press.scale }] },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <>
            {icon ? <Icon name={icon} size={20} color={textColor} /> : null}
            <Text style={[styles.clayText, { color: textColor }]}>{label}</Text>
          </>
        )}
        {badge ? (
          <View style={[styles.clayBadge, { backgroundColor: colors.gold }]}>
            <Text style={[styles.clayBadgeText, { color: colors.textOnPrimary }]}>{badge}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

/**
 * A centered "couldn't load — try again" state (KUR-278). Shown in place of a
 * screen's content when its data fetch fails, so a network/server error reads as
 * an error with a retry — not a misleading empty state.
 *
 * It wears the same picture and the same button as being offline, which is the
 * same news for the reader: the page did not arrive, and here is the way to ask
 * again. It used to be a red cross over a full-width button — the one alarm in a
 * calm app, for something that is never the reader's doing.
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

/** Inset of the travelling capsule from the edge of its track. */
const SEG_PAD = 3;
const SEG_SLOP = { top: 6, bottom: 6 };

/** A labelled (radio) segment's vertical padding: 3 + 11 + an 18pt line + 11 + 3 clears 44. */
const SEG_PAD_V_TALL = 11;

/**
 * A segmented control: a track, and a capsule that slides to the option you
 * picked.
 *
 * It used to be the one piece of "real glass" in the app — a clear lens over
 * the chosen word, which it magnified and fringed with colour at the edges
 * of its letters. Up close that read as the word printed twice slightly out
 * of register, and the magnified label was the first to be cut off in a
 * longer language. The capsule is now a plain raised fill, the chosen word is
 * the same size as the others and heavier, and the slide is the only motion.
 * It is instant when the reader has asked for less motion, and mirrored in a
 * right-to-left language, where the first option is the one on the right.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labelOf,
  groupLabel,
  size = 'regular',
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf: (v: T) => string;
  /**
   * What the choice is ("Questions", "Timer"). Given, the control is read out
   * as a radio group under that name and each segment as a radio — one of a
   * set, with the chosen one checked — which is what a preset picker is.
   * Without it the segments stay buttons, as every older caller has them.
   */
  groupLabel?: string;
  /**
   * `large` is a fingertip tall (44, with the track's padding) whatever it is
   * used for — the switch at the top of a tab is one of the first things a
   * new reader touches. A preset picker (one with a `groupLabel`) is always
   * that tall; the older, denser filters keep their height.
   */
  size?: 'regular' | 'large';
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const [box, setBox] = useState({ w: 0, h: 0 });
  const chosen = Math.max(0, options.indexOf(value));
  // where the capsule sits, counted from the left whichever way the options run
  const index = mirrored ? options.length - 1 - chosen : chosen;
  const seg = box.w > 0 ? (box.w - SEG_PAD * 2) / options.length : 0;
  const x = useRef(new Animated.Value(0)).current;
  const padV = groupLabel || size === 'large' ? SEG_PAD_V_TALL : 6;

  useEffect(() => {
    if (seg <= 0) return;
    const to = SEG_PAD + index * seg;
    if (reduceMotion) {
      x.setValue(to);
      return;
    }
    Animated.timing(x, { toValue: to, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
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
            { width: seg, backgroundColor: colors.selectedFill, shadowColor: colors.softShadow, transform: [{ translateX: x }] },
          ]}
        />
      ) : null}

      {options.map((opt) => {
        const active = opt === value;
        const label = labelOf(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => {
              // a tick for a change of value, and nothing for tapping the one already chosen
              if (!active) haptic('select');
              onChange(opt);
            }}
            accessibilityRole={groupLabel ? 'radio' : 'button'}
            accessibilityState={groupLabel ? { checked: active } : { selected: active }}
            accessibilityLabel={label}
            // a regular segment is drawn 32pt tall; the slop takes its touch to 44 without making it look bigger
            hitSlop={padV < SEG_PAD_V_TALL ? SEG_SLOP : undefined}
            style={[styles.segItem, { paddingVertical: padV }]}
          >
            <Text
              style={[
                styles.segText,
                { color: active ? colors.textPrimary : colors.textSecondary },
                active && styles.segTextActive,
              ]}
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * A settings row that shows the current value + a chevron and opens a frosted
 * glass menu to pick another (KUR-268). Used for the Language / Theme choosers.
 */
export function GlassSelect<T extends string>({
  label,
  value,
  options,
  labelOf,
  onChange,
  icon,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labelOf: (v: T) => string;
  onChange: (v: T) => void;
  icon?: IconName;
}): React.JSX.Element {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label}>
        {({ pressed }) => (
          <>
            <View style={[styles.row, pressed && { opacity: 0.6 }]}>
              {icon ? (
                <View style={styles.rowIcon}>
                  <Icon name={icon} size={20} color={colors.primary} />
                </View>
              ) : null}
              {/* the name takes the room, so the value sits at the end of the row as in the system's own settings */}
              <Text style={[styles.rowTitle, styles.fill, { color: colors.textPrimary }]} numberOfLines={1}>{label}</Text>
              <Text style={[styles.rowValue, styles.selectValue, { color: colors.textSecondary }]} numberOfLines={1}>{labelOf(value)}</Text>
              <Icon name="chevron-down" size={14} color={colors.textSecondary} />
            </View>
          </>
        )}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.selectBackdrop} onPress={() => setOpen(false)}>
          <Pressable onPress={() => undefined} style={styles.selectMenuWrap}>
            {/* the menu grows in from just under its size as the scrim fades */}
            <MenuIn>
              <GlassCard style={styles.selectMenu}>
                <Text style={[styles.selectMenuTitle, { color: colors.textSecondary }]}>{label}</Text>
                {options.map((opt) => {
                  const active = opt === value;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => {
                        if (!active) haptic('select');
                        onChange(opt);
                        setOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={styles.selectOption}
                    >
                      <Text style={[styles.selectOptionText, { color: active ? colors.primary : colors.textPrimary }, active && styles.selectOptionActive]}>
                        {labelOf(opt)}
                      </Text>
                      {active ? <Icon name="check" size={18} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </GlassCard>
            </MenuIn>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  /*
   * A card sits on the page; it does not float over it. The shadow is only
   * enough to lift a near-white card off a near-white page — the sheets and
   * the menus are the things that float, and they keep the
   * deeper one.
   */
  shadow: {
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    // elevation is Android-only; web/iOS use the shadow* props above
    elevation: 1,
  },
  clip: { borderRadius: radii.lg, overflow: 'hidden' },
  glassFace: { borderRadius: radii.lg, padding: spacing.lg, overflow: 'hidden' },
  glassFaceTight: { paddingVertical: spacing.xs },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%', opacity: 0.6 },

  /** aligned with the title: the icon column plus the gap after it */
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET, paddingVertical: 11 },
  rowIcon: { width: 26, alignItems: 'center' },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.ios.row, fontWeight: typography.weights.regular },
  rowSubtitle: { fontSize: typography.sizes.sm },
  rowValue: { fontSize: typography.ios.row },
  selectValue: { maxWidth: '50%' },
  /*
   * A capsule, flat. Buttons and chips are pills everywhere in the app now, so
   * a button reads as one at a glance whatever screen it is on; the drop
   * shadow went with the clay, since a button is part of the page.
   */
  clay: {
    borderRadius: radii.pill,
    borderWidth: 1,
    // at least a fingertip; taller when the reader's text size makes the label wrap
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: spacing.xs,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  // 50, which is what iOS gives the full-width button a screen is about
  clayLarge: { minHeight: 50, alignSelf: 'stretch' },
  clayText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  clayBadge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  clayBadgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  segTrack: { borderRadius: radii.pill, padding: SEG_PAD },
  // absolute, so it can travel independently of the row it sits behind
  segCapsule: {
    position: 'absolute',
    left: 0,
    top: SEG_PAD,
    bottom: SEG_PAD,
    borderRadius: radii.pill,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 1,
  },
  segItem: { flex: 1, paddingVertical: 6, paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  segTextActive: { fontWeight: typography.weights.semibold },
  selectBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  selectMenuWrap: { alignSelf: 'stretch' },
  selectMenu: { alignSelf: 'stretch', gap: spacing.xs },
  selectMenuTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textTransform: 'uppercase', marginBottom: spacing.xs },
  selectOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  selectOptionText: { fontSize: typography.sizes.lg },
  selectOptionActive: { fontWeight: typography.weights.bold },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
