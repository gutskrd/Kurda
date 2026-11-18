import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { fontScaleCap, spacing, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';

/**
 * A page's name set large as part of the page, between a pushed screen's `ScreenHeader` and a tab's `TabHeader`: the
 * way back before it and one link after it (Friends). It adds no top inset; each screen reserves that itself.
 */
export function LargeTitle({
  title,
  left,
  right,
  style,
}: {
  title: string;
  /** A leading control, before the title. */
  left?: ReactNode;
  /** A trailing action, on the title's own line. */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();

  return (
    <View style={style}>
      <View style={[styles.row, { flexDirection: dir.row }]}>
        {left ?? null}
        <Text
          style={[styles.title, dir.text, { color: colors.textPrimary }]}
          numberOfLines={1}
          // One line at 34pt: grown without limit it would be cut off after a few letters.
          maxFontSizeMultiplier={fontScaleCap.heading}
          // A long name is set a little smaller on the phone rather than cut.
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {right ?? null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The title takes the space, so a leading control sits before it and a trailing one at the end.
  row: { alignItems: 'center', gap: spacing.md, minHeight: 44 },
  // 34pt, the large-title size.
  title: { ...display(typography.sizes.xxl), flex: 1 },
});
