import { StyleSheet, Text } from 'react-native';
import { display } from '../../theme/fonts';
import { useTheme } from '../../theme/ThemeProvider';
import { useDirection } from '../../reports/direction';

/**
 * What an exercise asks, as it opens: "Match the pairs", "Tap what you hear".
 * In the display face, at 26 under the lesson's name, read first by a screen
 * reader as the screen's heading — the one line that says what to do before
 * anything is tapped.
 */
export function ExerciseHeadline({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Text accessibilityRole="header" style={[styles.headline, dir.text, { color: colors.textPrimary }]}>
      {children}
    </Text>
  );
}

/** A step under the scale's large title, so the question sits under the lesson's name as one heading with it. */
const HEADLINE = 26;

const styles = StyleSheet.create({
  headline: { ...display(HEADLINE) },
});
