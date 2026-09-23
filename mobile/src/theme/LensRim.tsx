import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from './ThemeProvider';

/**
 * What a piece of glass looks like at its edge.
 *
 * Real glass has no outline. What you see at the boundary is the light bending
 * through it: warm where it leaves, cool where it enters, and brightest along
 * one edge where it catches. The recordings this was built from show that
 * plainly — a clear lens over text, the text visibly bent, and a band of
 * orange and blue around the rim. No line anywhere.
 *
 * This app drew a hairline instead, on every surface, in the same grey. That
 * is what a border looks like, not what glass looks like, and seventy-five
 * surfaces had one.
 *
 * So the rim is three gradients and no stroke:
 *
 *   a warm band along the top, amber into orange, fading down
 *   a cool band along the bottom, cyan into violet, fading up
 *   a bright specular in the top-left corner, short and sharp
 *   nothing at all in the middle
 *
 * Two stops per band rather than one, because a single hue at an edge is a
 * coloured line and what a lens actually does is spread the light. And the
 * bands are measured off the radius: 2pt on a sixty-point tab bar is a
 * hairline again, which is the thing this replaced.
 *
 * It is an impression of refraction, not refraction. Bending what is actually
 * behind the surface needs a backdrop shader — Skia's `RuntimeShader`, or
 * SwiftUI's own glass on iOS 26 — and neither is in this app's dependencies.
 * What this does have is the colour and the falloff, which is most of what the
 * eye reads as glass at these sizes.
 */
export function LensRim({
  radius,
  style,
  /** Dial the whole thing down for a small surface, where a full rim shouts. */
  strength = 1,
}: {
  radius: number;
  style?: StyleProp<ViewStyle>;
  strength?: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  // a soft edge on a big surface, and still an edge on a small one
  const band = Math.max(2, Math.round(radius * 0.18));

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }, style]}
    >
      <LinearGradient
        colors={[colors.lensWarm[0], colors.lensWarm[1], 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.top, { height: band, opacity: strength }]}
      />
      <LinearGradient
        colors={['transparent', colors.lensCool[0], colors.lensCool[1]]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.bottom, { height: band, opacity: strength }]}
      />
      <LinearGradient
        colors={[colors.lensSpecular, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.65, y: 0.9 }}
        style={[styles.specular, { width: radius * 2.4, height: radius * 1.2, opacity: strength }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // the colour lives at the boundary and nowhere else; the height comes
  // from the radius at the call site
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  // sized from the radius at the call site; these are the ceilings, so a small
  // surface gets a highlight in proportion to itself rather than a wash
  specular: { position: 'absolute', top: 0, left: 0, maxWidth: '55%', maxHeight: '45%' },
});
