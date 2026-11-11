import { StyleSheet, Text, View } from 'react-native';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

/**
 * How a game ended for you, at the top of its scoreboard: the words, and a
 * trophy over them when you won.
 *
 * The trophy was an emoji at the front of the catalogue's "You won!". So it
 * came in the platform's colours rather than the app's, a screen reader read
 * it out before the words, and it went along wherever the words were
 * announced. It is drawn here from the app's own icons, in the gold made for
 * the page, and the words are the heading a screen reader hears.
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
  words: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, textAlign: 'center' },
});
