import { useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, spacing, typography } from './tokens';
import { useTheme } from './ThemeProvider';
import { Icon, type IconName } from './Icon';

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
 * Frosted glassmorphism / liquid-glass surface: a real backdrop blur, a
 * translucent tint, a hairline edge, and a top catch-light sheen — floating
 * over the gradient with a soft spatial shadow.
 */
export function GlassCard({
  children,
  style,
  intensity,
  blur = 'regular',
  padding = 'regular',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  /** Blur tier: 'soft' for flat scrolled content, 'strong' for floating surfaces. */
  blur?: 'soft' | 'regular' | 'strong';
  /** 'tight' trims the vertical padding for dense row-lists (Settings). */
  padding?: 'regular' | 'tight';
}): React.JSX.Element {
  const { colors } = useTheme();
  const level = intensity ?? (blur === 'soft' ? colors.blurSoft : blur === 'strong' ? colors.blurStrong : colors.blurIntensity);
  return (
    <View style={[styles.shadow, { shadowColor: colors.softShadow }, style]}>
      <View style={styles.clip}>
        <BlurView intensity={level} tint={colors.blurTint} style={StyleSheet.absoluteFill} />
        <View style={[styles.glassFace, padding === 'tight' && styles.glassFaceTight, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}>
          <LinearGradient
            colors={[colors.glassHighlight, 'transparent']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.4, y: 1 }}
            style={[styles.sheen, { pointerEvents: 'none' }]}
          />
          {children}
        </View>
      </View>
    </View>
  );
}

/** A faint hairline divider between rows inside a glass surface. */
export function Separator({ style }: { style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  return <View style={[styles.separator, { backgroundColor: colors.separator }, style]} />;
}

/**
 * A single settings / list row inside a GlassCard (KUR-270 polish). One consistent
 * layout — optional leading icon, a title + optional subtitle, and a trailing slot
 * (value text, chevron, switch, or any node) — with a comfortable ≥52px touch
 * target and a subtle press highlight. The row itself is translucent; the parent
 * GlassCard supplies the glass, so there's no per-row border ("frost line").
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
  first = false,
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
  /** Skip the top separator (use for the first row in a card). */
  first?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const titleColor = destructive ? colors.danger : colors.textPrimary;
  const body = (pressed: boolean) => (
    <>
      {first ? null : <Separator style={styles.rowSeparator} />}
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
        {trailing ?? (onPress && !value ? <Icon name="chevron-right" size={16} color={colors.textSecondary} /> : null)}
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
export function ClayButton({
  label,
  onPress,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'primary';
  /** Optional skeuomorphic icon rendered before the label. */
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const fill = tone === 'primary' ? ([colors.primary, colors.primaryStrong] as const) : colors.clayFill;
  const textColor = tone === 'primary' ? colors.textOnPrimary : colors.textPrimary;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}>
      <LinearGradient
        colors={fill}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.clay, { borderColor: colors.clayBorder, shadowColor: colors.softShadow }]}
      >
        {icon ? <Icon name={icon} size={20} color={textColor} /> : null}
        <Text style={[styles.clayText, { color: textColor }]}>{label}</Text>
      </LinearGradient>
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
  return (
    <View style={[styles.errorWrap, style]}>
      <Icon name="close" size={28} color={colors.danger} />
      <Text style={[styles.errorTitle, { color: colors.textPrimary }]}>Couldn’t load</Text>
      <Text style={[styles.errorMsg, { color: colors.textSecondary }]}>
        {message ?? 'Something went wrong. Check your connection and try again.'}
      </Text>
      <ClayButton label="Try again" tone="primary" onPress={onRetry} style={styles.errorButton} />
    </View>
  );
}

/** Segmented control on a glass track (used for the theme picker). */
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
  return (
    <View style={[styles.segTrack, { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder }]}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable key={opt} onPress={() => onChange(opt)} accessibilityRole="button" accessibilityState={{ selected: active }} style={styles.segItem}>
            {active ? (
              <LinearGradient colors={[colors.primary, colors.primaryStrong]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
            ) : null}
            <Text style={[styles.segText, { color: active ? colors.textOnPrimary : colors.textSecondary }]}>{labelOf(opt)}</Text>
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
  first = false,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labelOf: (v: T) => string;
  onChange: (v: T) => void;
  icon?: IconName;
  /** Skip the top separator (first row in a card). */
  first?: boolean;
}): React.JSX.Element {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={label}>
        {({ pressed }) => (
          <>
            {first ? null : <Separator style={styles.rowSeparator} />}
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
  glassFace: { borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, overflow: 'hidden' },
  glassFaceTight: { paddingVertical: spacing.xs },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%', opacity: 0.6 },
  separator: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  rowSeparator: { marginHorizontal: -spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, paddingVertical: spacing.sm },
  rowIcon: { width: 26, alignItems: 'center' },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  rowSubtitle: { fontSize: typography.sizes.sm },
  rowValue: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  clay: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  clayText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  segTrack: { flexDirection: 'row', borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, padding: 4, gap: 4 },
  segItem: { flex: 1, borderRadius: radii.pill, overflow: 'hidden', paddingVertical: spacing.sm, alignItems: 'center' },
  segText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
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
