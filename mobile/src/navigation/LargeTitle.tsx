import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { fontScaleCap, spacing, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';

/**
 * A page's name set large, as part of the page rather than in a bar over it.
 *
 * A pushed screen gets `ScreenHeader`: a 44pt bar with the title centred
 * between the way back and whatever sits opposite it. A tab gets
 * `TabHeader`, with search and the bell at its far end. This is for the page
 * between the two — Friends — whose name is big, at the reading edge, with
 * the way back before it and one link after it.
 *
 * No top inset here. The screens reserve it differently — one on a list's
 * content container, others on the screen — and each of those is right for
 * what it wraps, so this stays out of it.
 */
export function LargeTitle({
  title,
  subtitle,
  left,
  right,
  style,
}: {
  title: string;
  /** The line under it, where a page has something worth saying about itself. */
  subtitle?: string;
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
          // one line at 34 points: grown without limit it is cut off with an ellipsis after a few letters
          maxFontSizeMultiplier={fontScaleCap.heading}
          // a long name is set a little smaller on the phone rather than cut
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          accessibilityRole="header"
        >
          {title}
        </Text>
        {right ?? null}
      </View>
      {subtitle ? <Text style={[styles.subtitle, dir.text, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // the title takes the space, so a leading control sits before it and a
  // trailing one is pushed to the end — rather than all three spreading out
  row: { alignItems: 'center', gap: spacing.md, minHeight: 44 },
  // 34, the large-title size
  title: { ...display(typography.sizes.xxl), flex: 1 },
  subtitle: { fontSize: typography.sizes.sm, marginTop: 2 },
});
