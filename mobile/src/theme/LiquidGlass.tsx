import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { ANDROID_LENS, AndroidGlass } from '../../modules/hevalo-glass';
import { floating } from './floating';
import { useTheme } from './ThemeProvider';
import { radii } from './tokens';

/** Whether this phone draws the system's Liquid Glass: iOS 26 and later, where the API is really there. */
export const SYSTEM_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/** Whether the glass bends what lies behind it: the system's on iOS 26, Hevalo's own on Android 13 and later. */
export const BENDING_GLASS = SYSTEM_GLASS || (ANDROID_LENS && AndroidGlass !== null);

/**
 * Liquid glass for what floats over the page (the tab bar, the back button, the pill of top actions), never for the page
 * itself, and never blurred. On iOS 26 it is the system's clear glass, which bends the page at its rim, lights its edge
 * and answers a touch. On Android 13 and later it is Hevalo's own (modules/hevalo-glass), which bends, tints and
 * lights the page the same way the website does. Elsewhere the shape keeps the bar's solid fill and its lift, with a
 * line of light round its edge.
 *
 * `GlassFill` goes first inside the shape and fills it; `useGlassShape` is the shape's own style to go with it.
 */
export function GlassFill({
  interactive = false,
  radius = radii.pill,
  lift = 'control',
}: {
  interactive?: boolean;
  radius?: number;
  /** How far it floats: a top control rests on the page, the tab bar rides higher (floating.ts). */
  lift?: 'control' | 'raised';
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  if (SYSTEM_GLASS) {
    return (
      <GlassView
        glassEffectStyle="clear"
        colorScheme={scheme}
        // A breath of tint, as the system's own bars keep words readable on clear glass.
        tintColor={colors.glassTint}
        isInteractive={interactive}
        pointerEvents={interactive ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      />
    );
  }
  if (ANDROID_LENS && AndroidGlass) {
    // Its outline casts the shadow that lifts it off a pale page; the glass inside covers the shadow beneath it.
    return (
      <AndroidGlass
        radius={radius}
        dark={scheme === 'dark'}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { borderRadius: radius, elevation: floating[lift].elevation }]}
      />
    );
  }
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.rim,
        { borderRadius: radius, borderTopColor: colors.glassRim, borderStartColor: colors.glassRimFar, borderEndColor: colors.glassRimFar, borderBottomColor: colors.glassRimFar },
      ]}
    />
  );
}

/** The floating shape's own style: clear over glass that draws its own depth, or the bar's fill and lift. */
export function useGlassShape(lift: 'control' | 'raised'): ViewStyle[] {
  const { colors } = useTheme();
  if (BENDING_GLASS) return [styles.clear];
  return [floating[lift], { backgroundColor: colors.barFill, shadowColor: colors.softShadow }];
}

const styles = StyleSheet.create({
  rim: { borderWidth: 1 },
  clear: { backgroundColor: 'transparent' },
});
