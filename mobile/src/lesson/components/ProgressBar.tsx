import { StyleSheet, View } from 'react-native';
import { radii } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';

/** Thin lesson progress bar; `value` is 0..1. */
export function ProgressBar({ value }: { value: number }) {
  const { colors } = useTheme();
  const pct = `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` as const;
  return (
    <View style={[styles.track, { backgroundColor: colors.glassBorder }]} accessibilityRole="progressbar">
      <View style={[styles.fill, { width: pct, backgroundColor: colors.success }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 12,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
  },
});
