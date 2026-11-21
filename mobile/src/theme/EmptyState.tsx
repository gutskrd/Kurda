import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable, ReachGroup } from './Pressable';
import { PressableScale } from './MotionParts';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { display } from './fonts';
import { useTheme } from './ThemeProvider';
import { HevaloPeek } from '../characters/HevaloPeek';
import { pressedDim } from './motion';

/** Hevalo greets an empty list and looks puzzled at one that could not load. */
type EmptyArt = 'empty' | 'offline';

/** How tall the picture is drawn, in points. */
const ART_HEIGHT = 132;

/** The picture alone, decorative and hidden from screen readers: for a screen that lays out its own words (the crash screen). */
export function EmptyPicture({ art = 'empty', style, testID }: { art?: EmptyArt; style?: StyleProp<ViewStyle>; testID?: string }): React.JSX.Element {
  return (
    <View style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      <HevaloPeek size={ART_HEIGHT} pop={false} still brows={art === 'offline' ? 'one' : undefined} />
    </View>
  );
}

/**
 * What a screen says when it has nothing to show: a drawing, the message as a heading, an optional line saying what
 * belongs here, and where there is one, the button that fills it, so an empty list reads as a beginning rather than
 * a failure. The same character every time, rather than an icon per screen. The picture is decorative and hidden from
 * screen readers; the heading says it in words.
 */
export function EmptyState({
  art = 'empty',
  title,
  body,
  action,
  secondary,
}: {
  /** `empty` for a list with nothing in it, `offline` for a screen that could not load. */
  art?: EmptyArt;
  /** One line: what is not here. */
  title: string;
  /** What would be here, or what to do about it. Skipped when the title says it. */
  body?: string;
  /** The way out, where the screen has one. */
  action?: { label: string; onPress: () => void };
  /** A second, quieter way out, never instead of `action` and never a third (an empty feed: find people, or write something). */
  secondary?: { label: string; onPress: () => void };
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <EmptyPicture art={art} style={styles.art} />

      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text> : null}

      {/* The way out stands alone, so it reaches 8 past its edges; two ways out share the gap between them half each. */}
      <ReachGroup rowGap={spacing.sm}>
        {action ? (
          <PressableScale
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            reach="open"
            style={[styles.action, { backgroundColor: colors.accent }]}
          >
            <Text style={[styles.actionText, { color: colors.textOnPrimary }]}>{action.label}</Text>
          </PressableScale>
        ) : null}
        {secondary ? (
          <Pressable
            onPress={secondary.onPress}
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
            reach="open"
            style={({ pressed }) => [styles.secondary, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
          >
            <Text style={[styles.actionText, { color: colors.textPrimary }]}>{secondary.label}</Text>
          </Pressable>
        ) : null}
      </ReachGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  art: { marginBottom: spacing.xs },
  title: { ...display(typography.sizes.text), textAlign: 'center' },
  body: { fontSize: typography.sizes.text, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
  action: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  secondary: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
