import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useValley } from '../ValleyScope';

/** The hills' height in points; they stretch to the screen's width. */
const HILLS_HEIGHT = 120;

/**
 * The low pale hills behind the top of a lesson, a flat painted backdrop that fades into the paper. Untouchable and
 * hidden from screen readers. `top` is where they start, so the lesson's bar sits on the ridge on every phone.
 */
export function Hills({ top }: { top: number }): React.JSX.Element {
  const valley = useValley();
  const [far, mid, near] = valley.hills;
  // On the web every picture shares one page, where two gradients of one id would collide.
  const fade = `hills-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View
      style={[styles.hills, { top }]}
      pointerEvents="none"
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="lesson-hills"
    >
      <Svg width="100%" height={HILLS_HEIGHT} viewBox={`0 0 390 ${HILLS_HEIGHT}`} preserveAspectRatio="none">
        <Defs>
          {/* The nearest slope fades into the paper, so the hills have no edge along their foot. */}
          <LinearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={near} />
            <Stop offset="1" stopColor={valley.paper} />
          </LinearGradient>
        </Defs>
        <Path d="M0 70 L40 52 L78 64 L120 40 L168 60 L210 38 L262 58 L300 44 L350 60 L390 50 V120 H0Z" fill={far} />
        <Path d="M0 88 C60 74 110 92 170 80 C230 68 290 90 390 76 V120 H0Z" fill={mid} />
        <Path d="M0 104 C80 96 150 108 230 100 C300 94 350 104 390 98 V120 H0Z" fill={`url(#${fade})`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  hills: { position: 'absolute', left: 0, right: 0, height: HILLS_HEIGHT },
});
