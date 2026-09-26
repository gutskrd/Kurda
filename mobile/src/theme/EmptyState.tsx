import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { display } from './fonts';
import { Icon, type IconName } from './Icon';
import { LensRim } from './LensRim';
import { useTheme } from './ThemeProvider';

/**
 * What a screen says when it has nothing to show.
 *
 * Every empty list in this app said one grey sentence in the middle of a blank
 * screen — "Nothing here yet.", six times over, in the same weight as a
 * caption. Three things are wrong with that. It reads as a failure rather than
 * as a beginning; it looks identical whether the list is empty, still loading,
 * or broken; and it never says what would be there or how to put something
 * there, which on a screen with nothing else on it is the only useful thing it
 * could say.
 *
 * So: a glyph for the thing that is missing, the sentence promoted to a
 * heading, an optional line under it saying what belongs here, and — where
 * there is one — the button that fills it.
 *
 * The glyph sits in a soft disc rather than floating. A lone icon on an empty
 * screen reads as an error badge; one in a disc reads as a placeholder for
 * something, which is what it is.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  /** One line. What is not here. */
  title: string;
  /** What would be here, or what to do about it. Skipped when the title says it. */
  body?: string;
  /** The way out, where the screen has one. */
  action?: { label: string; onPress: () => void };
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.disc, { backgroundColor: colors.glassFill }]}>
        <LensRim radius={DISC / 2} />
        <Icon name={icon} size={30} color={colors.textSecondary} />
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text> : null}

      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.actionText, { color: colors.textOnPrimary }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const DISC = 72;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  title: { ...display(typography.sizes.lg), textAlign: 'center' },
  body: { fontSize: typography.sizes.md, textAlign: 'center', maxWidth: 280 },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  actionText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
