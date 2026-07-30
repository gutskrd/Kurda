import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography } from '../../theme/tokens';

/** Lives display: filled hearts for remaining, hollow for lost. */
export function HeartsBar({ hearts, max }: { hearts: number; max: number }) {
  return (
    <View style={styles.row} accessibilityLabel={`${hearts} of ${max} lives`}>
      {Array.from({ length: max }, (_, i) => (
        <Text key={i} style={styles.heart}>
          {i < hearts ? '❤️' : '🤍'}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  heart: { fontSize: typography.sizes.md },
});
