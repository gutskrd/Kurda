import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={[styles.shadow, { shadowColor: colors.softShadow }, style]}>
      <View style={styles.clip}>
        <BlurView intensity={intensity ?? colors.blurIntensity} tint={colors.blurTint} style={StyleSheet.absoluteFill} />
        <View style={[styles.glassFace, { backgroundColor: colors.glassFill, borderColor: colors.glassBorder }]}>
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
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%', opacity: 0.6 },
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
});
