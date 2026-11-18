import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, SvgXml } from 'react-native-svg';
import { coinSvg, gemSvg } from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { timing } from './animate';
import { PULSE_MS } from './motion';
import { useTheme } from './ThemeProvider';
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from './icon-paths';

export type { IconName };

/**
 * The app's icons, from the same family at the same weight as the website's, drawn flat in one tint. The path data
 * is generated, not written: see `icon-paths.ts` and the script named in its header.
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
  // The two currencies are pictures in their own colours, not tinted glyphs.
  if (name === 'coin' || name === 'gem') return <CurrencyIcon name={name} size={size} style={style} />;
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

/** Zêr and gems in colour (shared `coinSvg`, `gemSvg`), the same pictures as the website's whatever tint is asked for. */
function CurrencyIcon({ name, size, style }: { name: 'coin' | 'gem'; size: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const xml = useMemo(() => (name === 'coin' ? coinSvg : gemSvg)({ size }), [name, size]);
  return (
    <View style={[{ width: size, height: size }, style]}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

/** An {@link Icon} that gently breathes, a slow opacity pulse that never fully fades, for hero glyphs on onboarding and sign-in. Static under Reduce Motion. */
export function BreathingIcon({
  breaths = 3,
  ...props
}: {
  name: IconName;
  size?: number;
  color?: string;
  tone?: 'primary' | 'secondary' | 'onPrimary';
  style?: StyleProp<ViewStyle>;
  /** How many breaths before it stills: three by default, one for a glyph beside text to be read. */
  breaths?: number;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  // Only while its screen is in front.
  const alive = useMotionAlive();
  useEffect(() => {
    if (!alive) return;
    // A few breaths and then still, since a hero pulsing forever pulls the eye from the form below.
    const loop = Animated.loop(
      Animated.sequence([
        timing(opacity, 0.4, PULSE_MS.breath, { easing: Easing.inOut(Easing.sin) }),
        timing(opacity, 1, PULSE_MS.breath, { easing: Easing.inOut(Easing.sin) }),
      ]),
      { iterations: breaths },
    );
    loop.start();
    return () => {
      loop.stop();
      opacity.setValue(1);
    };
  }, [alive, opacity, breaths]);

  return (
    <Animated.View style={{ opacity: reduce ? 1 : opacity }}>
      <Icon {...props} />
    </Animated.View>
  );
}
