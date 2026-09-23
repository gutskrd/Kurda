import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from './ThemeProvider';
import { rimBand } from './rim';

/**
 * What a piece of glass looks like at its edge.
 *
 * Real glass has no outline. What you see at the boundary is the light
 * bending through it: warm where it leaves, cool where it enters, and
 * brightest along one edge where it catches. The recording shows it on a
 * clear disc dragged across a page — the words under it bent and bigger,
 * and a band of orange and blue at the left and right of the rim.
 *
 * Three gradients and no stroke:
 *
 *   a warm band on one edge, amber into orange, fading inwards
 *   a cool band on the other, cyan into violet, fading inwards
 *   a bright specular in the top-left corner, short and sharp
 *   nothing at all in the middle
 *
 * Two stops per band rather than one, because a single hue at an edge is a
 * coloured line and what a lens does is spread the light.
 *
 * This went on the cards and the tab bar first, which was a coloured border
 * round almost every surface in the app and made it decoration. It belongs
 * to one thing: the segmented control, which is the only selection here
 * that travels. The magnification that goes with it lives there too — see
 * `Segmented` in `glass.tsx`, where the label itself is scaled rather than
 * redrawn, so what you are looking at through the glass is the real thing.
 *
 * This is not refraction. Bending what is actually behind the surface needs
 * a backdrop shader — Skia's `RuntimeShader`, or the system glass on iOS 26
 * — and neither is in this app. What is here is the colour and the falloff.
 */
export function LensRim({
  radius,
  style,
  /** Dial the whole thing down for a small surface, where a full rim shouts. */
  strength = 1,
  /**
   * Which way the glass bends the light.
   *
   * 'y' puts the colour along the top and bottom, which is right for a card
   * or anything taller than it is wide. 'x' puts it at the left and right,
   * which is where the disc in the recording carries almost all of its —
   * and where a wide, low capsule carries its own.
   */
  axis = 'y',
}: {
  radius: number;
  style?: StyleProp<ViewStyle>;
  strength?: number;
  axis?: 'x' | 'y';
}): React.JSX.Element {
  const { colors } = useTheme();
  const band = rimBand(radius);
  // and the specular is bounded for the same reason the band is
  const reach = Math.min(radius, 40);
  const across = axis === 'x';
  const near = across
    ? ({ position: 'absolute', left: 0, top: 0, bottom: 0, width: band } as const)
    : ({ position: 'absolute', top: 0, left: 0, right: 0, height: band } as const);
  const far = across
    ? ({ position: 'absolute', right: 0, top: 0, bottom: 0, width: band } as const)
    : ({ position: 'absolute', bottom: 0, left: 0, right: 0, height: band } as const);
  const from = across ? { x: 0, y: 0.5 } : { x: 0.5, y: 0 };
  const to = across ? { x: 1, y: 0.5 } : { x: 0.5, y: 1 };

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }, style]}
    >
      <LinearGradient
        colors={[colors.lensWarm[0], colors.lensWarm[1], 'transparent']}
        start={from}
        end={to}
        style={[near, { opacity: strength }]}
      />
      <LinearGradient
        colors={['transparent', colors.lensCool[0], colors.lensCool[1]]}
        start={from}
        end={to}
        style={[far, { opacity: strength }]}
      />
      <LinearGradient
        colors={[colors.lensSpecular, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.65, y: 0.9 }}
        style={[styles.specular, { width: reach * 2.4, height: reach * 1.2, opacity: strength }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // the two bands are built inline, because which edge they sit on is a prop
  // sized from the radius at the call site; these are the ceilings, so a small
  // surface gets a highlight in proportion to itself rather than a wash
  specular: { position: 'absolute', top: 0, left: 0, maxWidth: '55%', maxHeight: '45%' },
});
