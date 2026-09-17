import { useEffect, useRef } from 'react';
import { Animated, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from './ThemeProvider';
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from './icon-paths';

export type { IconName };

/**
 * The app's icons, drawn from Phosphor — the same family, at the same weight,
 * as the browser.
 *
 * This was a hand-drawn set: ~35 filled silhouettes carrying a skeuomorphic
 * emboss — a dark edge offset down, a white highlight offset up, and a sheen
 * gradient over the face. The browser gave up its own hand-drawn set for
 * Phosphor because every new screen needed another glyph drawn and they drifted
 * in weight and optical size; the phone had the same problem and the added one
 * of not looking like the same product. A globe in the phone's tab bar and a
 * newspaper in the browser's nav are not two styles of one icon, they are two
 * different answers to "what is Civak".
 *
 * The emboss went with them. Phosphor at regular weight is a fine traced
 * outline, and offsetting a copy of one by a few per cent and painting it black
 * reads as a printing misregistration rather than as depth. The glass and clay
 * surfaces behind the icons still carry the app's dimensionality; the glyphs sit
 * on them flat, in one tint, which is also how the browser draws them.
 *
 * The path data is generated, not written — see `icon-paths.ts` and the script
 * named in its header.
 */
export function Icon({
  name,
  size = 24,
  color,
  tone,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  tone?: 'primary' | 'secondary' | 'onPrimary';
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const fill =
    color ??
    (tone === 'onPrimary'
      ? colors.textOnPrimary
      : tone === 'secondary'
        ? colors.textSecondary
        : tone === 'primary'
          ? colors.primary
          : colors.textPrimary);

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}>
        {ICON_PATHS[name].map((d) => (
          <Path key={d} d={d} fill={fill} />
        ))}
      </Svg>
    </View>
  );
}

/**
 * An {@link Icon} that gently "breathes" — a slow opacity pulse that never fully
 * fades — for the hero glyphs on the onboarding / sign-in slides. Falls back to
 * a static icon when the user prefers reduced motion.
 */
export function BreathingIcon(props: {
  name: IconName;
  size?: number;
  color?: string;
  tone?: 'primary' | 'secondary' | 'onPrimary';
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduce) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 1700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 1700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, opacity]);

  return (
    <Animated.View style={{ opacity: reduce ? 1 : opacity }}>
      <Icon {...props} />
    </Animated.View>
  );
}
