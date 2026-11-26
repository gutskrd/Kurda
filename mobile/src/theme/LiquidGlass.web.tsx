import { StyleSheet, View, type ViewStyle } from 'react-native';
import { floating } from './floating';
import { useTheme } from './ThemeProvider';
import { radii } from './tokens';

/** The web build has no system glass. */
export const SYSTEM_GLASS = false;

/** Whether this browser blurs what lies behind an element, as the website's glass does (styles/glass.css). */
export const BENDING_GLASS =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));

/** How the page behind is blurred and its colours lifted, and how the shape lifts off the page, as on the website (tokens.css). */
const OPTICS = { light: 'blur(24px) saturate(1.8)', dark: 'blur(24px) saturate(1.6)' };
const LIFT = { light: '0 6px 20px rgba(23, 36, 43, 0.1)', dark: '0 8px 24px rgba(0, 0, 0, 0.28)' };

/**
 * The phone app's glass in a browser, the website's own: a neutral grey that the page passes under blurred, a hairline
 * edge with a faint line of light along its top, and a soft lift. Where the browser cannot blur, the shape keeps the
 * bar's solid fill with the same edge.
 */
export function GlassFill({ radius = radii.pill }: { interactive?: boolean; radius?: number; lift?: 'control' | 'raised' }): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const face = {
    borderRadius: radius,
    boxShadow: `inset 0 0 0 0.5px ${colors.glassRimFar}, inset 0 1px 0 ${colors.glassRim}${BENDING_GLASS ? `, ${LIFT[scheme]}` : ''}`,
    ...(BENDING_GLASS ? { backgroundColor: colors.glassTint, backdropFilter: OPTICS[scheme], WebkitBackdropFilter: OPTICS[scheme] } : null),
  } as ViewStyle;
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, face]} />;
}

/** The floating shape's own style: clear over glass that draws its own face, or the bar's fill and lift. */
export function useGlassShape(lift: 'control' | 'raised'): ViewStyle[] {
  const { colors } = useTheme();
  if (BENDING_GLASS) return [styles.clear];
  return [floating[lift], { backgroundColor: colors.barFill, shadowColor: colors.softShadow }];
}

const styles = StyleSheet.create({
  clear: { backgroundColor: 'transparent' },
});
