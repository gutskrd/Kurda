import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

/**
 * How a game ended for you, at the top of its scoreboard: the words as a heading, with a gold trophy icon above
 * them when you won. The icon is drawn rather than an emoji in the text, so it uses the app's colours and screen
 * readers hear only the words.
 */
export function Verdict({ won, children }: { won: boolean; children: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.verdict}>
      {won ? <Icon name="trophy" size={TROPHY} color={colors.goldText} /> : null}
      <Text accessibilityRole="header" style={[styles.words, { color: colors.primary }]}>
        {children}
      </Text>
    </View>
  );
}

const TROPHY = 36;

const styles = StyleSheet.create({
  verdict: { alignItems: 'center', gap: spacing.xs },
  words: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, textAlign: 'center' },
});
