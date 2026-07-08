import { StyleSheet, View } from 'react-native';
import { colors, radii } from '../../theme/tokens';

/** Thin lesson progress bar; `value` is 0..1. */
export function ProgressBar({ value }: { value: number }) {
  const pct = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` as const;
  return (
    <View style={styles.track} accessibilityRole="progressbar">
      <View style={[styles.fill, { width: pct }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 12,
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.success,
    borderRadius: radii.pill,
  },
});
