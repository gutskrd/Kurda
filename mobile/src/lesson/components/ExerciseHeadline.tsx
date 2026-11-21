import { StyleSheet, Text } from 'react-native';
import { display } from '../../theme/fonts';
import { typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { useDirection } from '../../reports/direction';

/** What an exercise asks ("Match the pairs"), in the display face under the lesson's name; screen readers hear it first as the heading. */
export function ExerciseHeadline({ children }: { children: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <Text accessibilityRole="header" style={[styles.headline, dir.text, { color: colors.textPrimary }]}>
      {children}
    </Text>
  );
}

/** A step under the scale's large title, so the question reads as one heading with the lesson's name. */
const HEADLINE = typography.sizes.title;

const styles = StyleSheet.create({
  headline: { ...display(HEADLINE) },
});
