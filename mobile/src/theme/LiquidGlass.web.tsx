import { useEffect, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { dropLens, lensSupported, takeLens, type Lens } from '@kurda/shared/src/glass-lens';
import { floating } from './floating';
import { useTheme } from './ThemeProvider';
import { radii } from './tokens';

/** The web build has no system glass. */
export const SYSTEM_GLASS = false;

/** Whether this browser bends the page behind the glass, as the website does (Chromium). */
export const BENDING_GLASS = lensSupported();

/** How the colours behind the glass are lifted, and how it lifts off the page, by day and by night, as on the website (web/src/styles/tokens.css). */
const OPTICS = { light: 'saturate(1.8) brightness(1.08)', dark: 'saturate(1.7) brightness(0.92)' };
const LIFT = {
  light: '0 10px 30px rgba(46, 40, 74, 0.12), 0 0 0 0.5px rgba(46, 40, 74, 0.08)',
  dark: '0 10px 30px rgba(0, 0, 0, 0.35), 0 0 0 0.5px rgba(255, 255, 255, 0.1)',
};

/**
 * The phone app's glass in a browser: the website's lens (@kurda/shared's glass-lens), which bends the page at the rim
 * and lights the edge with the same optics as the Android glass. Where the browser cannot bend, the shape keeps the
 * bar's fill with the light on its edge.
 */
export function GlassFill({ radius = radii.pill }: { interactive?: boolean; radius?: number; lift?: 'control' | 'raised' }): React.JSX.Element {
  const { scheme } = useTheme();
  const ref = useRef<View>(null);
  useEffect(() => {
    const el = ref.current as unknown as HTMLElement | null;
    if (!el || typeof ResizeObserver === 'undefined') return;
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
      lens = takeLens({ width, height, radius: Math.min(radius, width / 2, height / 2) }, dpr, BENDING_GLASS);
      if (was) dropLens(was);
      const face = scheme === 'dark' ? lens.dark : lens.light;
      el.style.backgroundImage = face ? `url(${face})` : '';
      el.style.backgroundSize = '100% 100%';
      el.style.backdropFilter = lens.filter ? `url(#${lens.filter}) ${OPTICS[scheme]}` : OPTICS[scheme];
      el.style.boxShadow = LIFT[scheme];
    };
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    fit();
    return () => {
      watch.disconnect();
      if (lens) dropLens(lens);
    };
  }, [scheme, radius]);
  return <View ref={ref} pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />;
}

/** The floating shape's own style: clear over bending glass, or the bar's fill and lift. */
export function useGlassShape(lift: 'control' | 'raised'): ViewStyle[] {
  const { colors } = useTheme();
  if (BENDING_GLASS) return [styles.clear];
  return [floating[lift], { backgroundColor: colors.barFill, shadowColor: colors.softShadow }];
}

const styles = StyleSheet.create({
  clear: { backgroundColor: 'transparent' },
});
