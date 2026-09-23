import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LensRim } from './LensRim';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, spacing, typography } from './tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from './ThemeProvider';
import { Icon, type IconName } from './Icon';
import { useI18n } from '../i18n/I18nContext';

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

/** Claymorphic / neumorphic soft button — puffy gradient fill + soft shadow. */
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
  style,
}: {
  label: string;
  onPress: () => void;
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
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: off }}
      style={({ pressed }) => [{ opacity: off ? 0.5 : pressed ? 0.92 : 1, transform: [{ scale: pressed && !off ? 0.98 : 1 }] }, style]}
    >
      <View
        style={[
          styles.clay,
          size === 'large' && styles.clayLarge,
          { backgroundColor: fill, borderColor: edge },
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
      </View>
    </Pressable>
  );
}

/**
 * A centered "couldn't load — try again" state (KUR-278). Shown in place of a
 * screen's content when its data fetch fails, so a network/server error reads as
 * an error with a retry — not a misleading empty state.
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
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.errorWrap, style]}>
      <Icon name="close" size={28} color={colors.danger} />
      <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>{t('net.loadFailed')}</Text>
      <Text style={[styles.errorMsg, { color: colors.textSecondary }]}>
        {message ?? t('error.offline')}
      </Text>
      <ClayButton label={t('common.retry')} tone="primary" onPress={onRetry} style={styles.errorButton} />
    </View>
  );
}

/**
 * How much bigger the glass makes what is under it.
 *
 * 1.18 is small enough that the label still fits its segment at four
 * options and large enough to be unmistakably a magnification rather than a
 * bolder weight. Below about 1.1 it reads as the text simply being heavier.
 */
const LENS_MAGNIFY = 1.18;

/**
 * How far apart the glass puts the warm and the cool end of the spectrum.
 *
 * On a thirteen-point label a stroke is about a point and a half wide, so
 * this is roughly one stroke: enough to show at the edge of a letter and
 * not enough to read as the word being printed twice.
 */
const LENS_SPLIT = 1.2;

/** Inset of the travelling lens from the edge of its track. */
const SEG_PAD = 3;

/**
 * A segmented control, and the one piece of real glass in the app.
 *
 * Everything else here is a flat translucent fill. This is the thing with a
 * selection that travels, so this is where the lens goes: a clear capsule
 * that slides to the option you picked, and inside it the label is bigger
 * and its letters carry colour at their edges.
 *
 * The magnification is a transform on the label that is already there — the
 * real content being scaled, not a copy drawn over it — so there is nothing
 * to keep aligned and nothing to double.
 *
 * The two ghosts behind it are the dispersion: the same word in the warm end
 * of the rim colour a point and a half to one side, and in the cool end a
 * point and a half to the other. At rest you read it as an edge on the
 * letters. That is what the glass in the recording does to the text under
 * it, and it is as close as this gets without a backdrop shader — Skia’s
 * `RuntimeShader` or the system glass on iOS 26, neither of which is here.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf: (v: T) => string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const index = Math.max(0, options.indexOf(value));
  const seg = box.w > 0 ? (box.w - SEG_PAD * 2) / options.length : 0;
  // its real radius, not `radii.pill` — a capsule is round by half its height
  const lensRadius = Math.max(2, (box.h - SEG_PAD * 2) / 2);
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (seg <= 0) return;
    Animated.timing(x, {
      toValue: SEG_PAD + index * seg,
      duration: 240,
      easing: Easing.out(Easing.sin),
      useNativeDriver: true,
    }).start();
  }, [index, seg, x]);

  return (
    <View
      style={[styles.segTrack, { backgroundColor: colors.glassFill }]}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {/*
        The glass. It sits under the labels rather than over them, because a
        capsule drawn on top would need to redraw the word it covers, and the
        word it covers is the one being magnified anyway.
      */}
      {seg > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segLens,
            { width: seg, backgroundColor: colors.glassFill, transform: [{ translateX: x }] },
          ]}
        >
          <LensRim radius={lensRadius} axis="x" />
        </Animated.View>
      ) : null}

      {options.map((opt) => {
        const active = opt === value;
        const label = labelOf(opt);
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={styles.segItem}
          >
            {active ? (
              <>
                <Text
                  style={[
                    styles.segText,
                    styles.segGhost,
                    { color: colors.lensFringe[0], transform: [{ translateX: LENS_SPLIT }, { scale: LENS_MAGNIFY }] },
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
                <Text
                  style={[
                    styles.segText,
                    styles.segGhost,
                    { color: colors.lensFringe[1], transform: [{ translateX: -LENS_SPLIT }, { scale: LENS_MAGNIFY }] },
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </>
            ) : null}
            <Text
              style={[
                styles.segText,
                { color: active ? colors.textPrimary : colors.textSecondary },
                active ? { transform: [{ scale: LENS_MAGNIFY }] } : null,
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
              <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>{label}</Text>
              <Text style={[styles.rowValue, { color: colors.textSecondary }]} numberOfLines={1}>{labelOf(value)}</Text>
              <Icon name="chevron-down" size={14} color={colors.textSecondary} />
            </View>
          </>
        )}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.selectBackdrop} onPress={() => setOpen(false)}>
          <Pressable onPress={() => undefined} style={styles.selectMenuWrap}>
            <GlassCard style={styles.selectMenu}>
              <Text style={[styles.selectMenuTitle, { color: colors.textSecondary }]}>{label}</Text>
              {options.map((opt) => {
                const active = opt === value;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => {
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
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  shadow: {
    borderRadius: radii.lg,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    // elevation is Android-only; web/iOS use the shadow* props above
    elevation: 8,
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
  clay: {
    borderRadius: radii.sm,
    borderWidth: 1,
    height: MIN_TOUCH_TARGET,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  // 50, which is what iOS gives the full-width button a screen is about
  clayLarge: { height: 50, alignSelf: 'stretch' },
  clayText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
  clayBadge: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  clayBadgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  segTrack: { flexDirection: 'row', borderRadius: radii.pill, padding: SEG_PAD },
  // absolute, so it can travel independently of the row it sits behind
  segLens: {
    position: 'absolute',
    left: 0,
    top: SEG_PAD,
    bottom: SEG_PAD,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  segItem: { flex: 1, paddingVertical: 6, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  // sits exactly where the label sits, so the two ends of the spectrum land
  // a point and a half either side of it
  segGhost: { position: 'absolute', left: 0, right: 0, top: 6, textAlign: 'center' },
  selectBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  selectMenuWrap: { alignSelf: 'stretch' },
  selectMenu: { alignSelf: 'stretch', gap: spacing.xs },
  selectMenuTitle: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, textTransform: 'uppercase', marginBottom: spacing.xs },
  selectOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  selectOptionText: { fontSize: typography.sizes.lg },
  selectOptionActive: { fontWeight: typography.weights.bold },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.xl },
  errorTitle: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  errorMsg: { fontSize: typography.sizes.md, textAlign: 'center' },
  errorButton: { marginTop: spacing.md, alignSelf: 'stretch' },
});
