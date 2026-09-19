import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { spacing, typography } from '../theme/tokens';

/**
 * The head of a tab, which is not a nav bar.
 *
 * A pushed screen gets `ScreenHeader`: a 44pt bar with the title centred
 * between a back button and whatever sits opposite it. A tab has no back
 * button and nothing to balance against, so iOS gives it a large title instead
 * — big, leading-aligned, sitting above the content rather than in a bar.
 *
 * Three tabs wrote one and they disagreed about how big: Learn and Friends at
 * 34, which is the size iOS uses, and Civak at 26. The same word set in two
 * sizes on two tabs of the same app is the kind of difference nobody can name
 * and everybody can see when they switch between them.
 *
 * No top inset here. The three screens reserve it differently — one on a list's
 * content container, two on the screen — and each of those is right for what it
 * wraps, so this stays out of it.
 */
export function LargeTitle({
  title,
  subtitle,
  right,
  style,
}: {
  title: string;
  /** The line under it, where a tab has something worth saying about itself. */
  subtitle?: string;
  /** A trailing action, on the title's own line. */
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={style}>
      <View style={styles.row}>
        <Text style={[styles.title, { color: colors.primary }]} numberOfLines={1}>
          {title}
        </Text>
        {right ?? null}
      </View>
      {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  // 34, which is what iOS sets a large title at
  title: { ...display(typography.sizes.xxl), flexShrink: 1 },
  subtitle: { fontSize: typography.sizes.sm, marginTop: 2 },
});
