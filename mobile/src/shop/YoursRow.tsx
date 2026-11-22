import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDirection } from '../reports/direction';
import { sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { PressableScale } from '../theme/MotionParts';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';

/**
 * One of yours at the top of the Shop (your bird or your tree), drawn like a catalogue row (ShopScreen `ShopRow`) so it
 * reads as part of the Shop: what it is in small capitals, which one is yours under it, and a chevron. The tap opens a
 * sheet with every choice.
 */
export function YoursRow({
  art,
  label,
  value,
  onPress,
  testID,
}: {
  art: ReactNode;
  /** What this is: "Your pen pal bird", "Your tree" */
  label: string;
  /** Which one is yours now, or what there is to do. */
  value: string;
  onPress: () => void;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      testID={testID}
      // The wider padding on the chevron's side, which in right-to-left is the left.
      style={[styles.row, dir.row === 'row-reverse' ? styles.rowMirrored : null, { flexDirection: dir.row, backgroundColor: colors.glassFill }]}
    >
      <View style={styles.art}>{art}</View>
      {/* Both may take a second line rather than be cut short at 320pt. */}
      <View style={styles.main}>
        <Text style={[styles.label, dir.text, { color: colors.textSecondary }]} numberOfLines={2}>
          {label}
        </Text>
        <Text style={[styles.value, dir.text, { color: colors.textPrimary }]} numberOfLines={2}>
          {value}
        </Text>
      </View>
      <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
    </PressableScale>
  );
}

/** The row while what it shows is on its way, the same size, so nothing under it moves when it lands. */
export function YoursRowSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const start = { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' } as const;
  return (
    <View style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.glassFill }]}>
      <View style={styles.art}>
        <Skeleton width={ART} height={ART} radius={radii.pill} />
      </View>
      <View style={[styles.main, start]}>
        <SkeletonText size={typography.sizes.text} width={96} />
        <SkeletonText size={typography.sizes.text} width="46%" />
      </View>
    </View>
  );
}

/** The picture's side: the width of an icon's thumbnail in the catalogue's rows. */
export const ART = 48;

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: spacing.md, borderRadius: radii.md, padding: spacing.sm, paddingRight: spacing.md, minHeight: 64 },
  rowMirrored: { paddingRight: spacing.sm, paddingLeft: spacing.md },
  art: { width: 72, alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, gap: 2 },
  label: { ...sectionLabel },
  value: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
});
