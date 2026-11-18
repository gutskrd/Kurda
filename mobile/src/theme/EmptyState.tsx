import { Image, StyleSheet, Text, View } from 'react-native';
import { Pressable, ReachGroup } from './Pressable';
import { PressableScale } from './MotionParts';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { display } from './fonts';
import { useTheme } from './ThemeProvider';
import nothingHereDark from '../../assets/empty/nothing-here-dark.png';
import nothingHereLight from '../../assets/empty/nothing-here-light.png';
import offlineDark from '../../assets/empty/offline-dark.png';
import offlineLight from '../../assets/empty/offline-light.png';
import { pressedDim } from './motion';

/**
 * The drawings, one per theme. The silver-blue fawn is about 12:1 on the dark theme but only 1.4:1 on the light one,
 * so each is bundled twice, the light one at 72% brightness (3:1 against #F3F3F3). Imported rather than required, so
 * the type is `ImageSourcePropType`; the bundler needs literal paths either way.
 */
const ART = {
  empty: { dark: nothingHereDark, light: nothingHereLight },
  offline: { dark: offlineDark, light: offlineLight },
} as const;

type EmptyArt = keyof typeof ART;

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
  const { colors, scheme } = useTheme();
  return (
    <View style={styles.wrap}>
      <Image
        source={ART[art][scheme === 'dark' ? 'dark' : 'light']}
        style={styles.art}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />

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
            style={[styles.action, { backgroundColor: colors.primary }]}
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
  // 160 points from a 480-pixel source is exactly @3x, the densest screen there is.
  art: { width: 160, height: 135, marginBottom: spacing.xs },
  title: { ...display(typography.sizes.lg), textAlign: 'center' },
  body: { fontSize: typography.sizes.sm, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
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
  actionText: { fontSize: typography.ios.button, fontWeight: typography.weights.semibold },
});
