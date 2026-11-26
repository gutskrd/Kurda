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
 * Glass for what floats over the page (the tab bar, the back button, the pill of top actions), never for the page itself:
 * a neutral grey that the page passes under blurred. On iOS 26 it is the system's regular glass, which also lights its
 * edge and answers a touch. On Android 13 and later it is Hevalo's own (modules/hevalo-glass), which blurs, tints and
 * lights the page as the website does. Elsewhere the shape keeps the bar's solid neutral fill and its lift, with a line
 * of light round its edge.
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
        // The system's regular glass, which blurs the page passing under it, as its own tab bars do: no tint of ours.
        glassEffectStyle="regular"
        colorScheme={scheme}
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
  lens: { borderWidth: 1.5 },
  clear: { backgroundColor: 'transparent' },
});

/**
 * The lens a choice lifts into as it moves (theme/selectorLens.ts): on iOS 26 the system's clear glass, which bends and
 * magnifies the tabs it passes over as the system's own tab bar does; elsewhere clear glass of our own with a lit rim
 * and a faint split of colour at its edge. Never drawn at rest.
 */
export function LensFill({ radius }: { radius: number }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  if (SYSTEM_GLASS) {
    return <GlassView glassEffectStyle="clear" colorScheme={scheme} pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />;
  }
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.lens,
        { borderRadius: radius, backgroundColor: colors.lensFill, borderTopColor: colors.lensShine, borderBottomColor: colors.lensRim, borderLeftColor: colors.lensWarm, borderRightColor: colors.lensCool },
      ]}
    />
  );
}

