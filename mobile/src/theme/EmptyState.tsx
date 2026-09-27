import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { display } from './fonts';
import { useTheme } from './ThemeProvider';
import nothingHereDark from '../../assets/empty/nothing-here-dark.png';
import nothingHereLight from '../../assets/empty/nothing-here-light.png';
import offlineDark from '../../assets/empty/offline-dark.png';
import offlineLight from '../../assets/empty/offline-light.png';

/**
 * Which drawing, and one for each theme.
 *
 * The art is a fawn in silver-blue. On the dark theme that is about 12:1 and
 * looks exactly right; on the light theme it is 1.4:1 — the outlines survive
 * and the body of the animal does not, which is worse than no picture at all.
 * So each drawing is bundled twice, the light one at 72% brightness, which
 * measures 3:1 against #F3F3F3.
 *
 * Imported rather than required, which `images.d.ts` makes possible and which
 * is the difference between an `ImageSourcePropType` and an `any`. Either way
 * the bundler has to see the literal path, so these cannot be built up.
 */
const ART = {
  empty: { dark: nothingHereDark, light: nothingHereLight },
  offline: { dark: offlineDark, light: offlineLight },
} as const;

export type EmptyArt = keyof typeof ART;

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
 * So: a drawing, the sentence promoted to a heading, an optional line under it
 * saying what belongs here, and — where there is one — the button that fills
 * it.
 *
 * One drawing rather than a glyph per screen, and the same one every time.
 * Fifteen different icons is more literal and less memorable; a character you
 * meet in the same circumstances every time is how an app gets a personality,
 * and this one is doing the job an icon was standing in for.
 *
 * The picture is decoration and is hidden from screen readers. Everything it
 * says, the heading says in words.
 */
export function EmptyState({
  art = 'empty',
  title,
  body,
  action,
}: {
  /** `empty` for a list with nothing in it, `offline` for a screen that could not load. */
  art?: EmptyArt;
  /** One line. What is not here. */
  title: string;
  /** What would be here, or what to do about it. Skipped when the title says it. */
  body?: string;
  /** The way out, where the screen has one. */
  action?: { label: string; onPress: () => void };
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

      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [styles.action, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.actionText, { color: colors.textOnPrimary }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  // 160 at 480 of source is exactly @3x, which is the densest screen there is
  art: { width: 160, height: 135, marginBottom: spacing.xs },
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
