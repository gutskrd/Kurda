import { StyleSheet, View } from 'react-native';
import { spacing } from '../../theme/tokens';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';

/** Lives display: filled hearts for remaining, hollow for lost. */
export function HeartsBar({ hearts, max }: { hearts: number; max: number }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row} accessibilityLabel={`${hearts} of ${max} lives`}>
      {Array.from({ length: max }, (_, i) => (
        <Icon key={i} name="heart" size={18} color={i < hearts ? colors.danger : colors.glassBorder} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
});
