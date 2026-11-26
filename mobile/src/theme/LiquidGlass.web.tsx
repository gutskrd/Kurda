import { useEffect, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { dropLens, lensSupported, takeLens, type Lens } from '@kurda/shared/src/glass-lens';
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

/**
 * The lens a choice lifts into as it moves (theme/selectorLens.ts): clear glass with a lit rim and a faint split of
 * colour at its edge, which in a browser that can bend what lies behind an element (Chromium) also refracts the tabs it
 * passes over, as the website's does (shared glass-lens.ts). Never drawn at rest.
 */
export function LensFill({ radius }: { radius: number }): React.JSX.Element {
  const { colors } = useTheme();
  const ref = useRef<View>(null);
  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el || !lensSupported() || typeof ResizeObserver === 'undefined') return;
    let lens: Lens | null = null;
    let shape = '';
    const fit = () => {
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const next = `${width}x${height}@${dpr}`;
      if (next === shape || width < 8 || height < 8) return;
      shape = next;
      const was = lens;
      lens = takeLens({ width, height, radius: Math.min(radius, width / 2, height / 2) }, dpr, true);
      if (was) dropLens(was);
      el.style.backdropFilter = lens.filter ? `url(#${lens.filter})` : '';
    };
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    fit();
    return () => {
      watch.disconnect();
      if (lens) dropLens(lens);
    };
  }, [radius]);
  return (
    <View
      ref={ref}
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.lens,
        { borderRadius: radius, backgroundColor: colors.lensFill, borderTopColor: colors.lensShine, borderBottomColor: colors.lensRim, borderLeftColor: colors.lensWarm, borderRightColor: colors.lensCool },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  clear: { backgroundColor: 'transparent' },
  lens: { borderWidth: 1.5 },
});
