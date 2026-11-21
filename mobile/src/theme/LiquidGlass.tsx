import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { floating } from './floating';
import { useTheme } from './ThemeProvider';
import { radii } from './tokens';

/** Whether this phone draws the system's Liquid Glass: iOS 26 and later, where the API is really there. */
export const SYSTEM_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/**
 * Liquid glass for what floats over the page (the tab bar, the back button, the pill of top actions), never for the page
 * itself. On iOS 26 it is the system's own glass, in the app's light or dark: it bends the page at its rim, lights its
 * edge and answers a touch, and turns frosted or solid under Reduce Transparency. Elsewhere the shape keeps the bar's
 * solid fill and its lift, with a line of light round its edge.
 *
 * `GlassFill` goes first inside the shape and fills it; `useGlassShape` is the shape's own style to go with it.
 */
export function GlassFill({ interactive = false, radius = radii.pill }: { interactive?: boolean; radius?: number }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  if (SYSTEM_GLASS) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={scheme}
        isInteractive={interactive}
        pointerEvents={interactive ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
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

/** The floating shape's own style: clear over the system's glass, which draws its own depth, or the bar's fill and lift. */
export function useGlassShape(lift: 'control' | 'raised'): ViewStyle[] {
  const { colors } = useTheme();
  if (SYSTEM_GLASS) return [styles.clear];
  return [floating[lift], { backgroundColor: colors.barFill, shadowColor: colors.softShadow }];
}

const styles = StyleSheet.create({
  rim: { borderWidth: 1 },
  clear: { backgroundColor: 'transparent' },
});
