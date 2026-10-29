import { useId } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { ChestTier } from '@kurda/shared';

/**
 * A quest's chest, drawn: a little wooden trunk bound in the sun's gold, its
 * panels tinted by how much it holds — warm wood, river blue, dusk violet —
 * with the sun on its clasp. One drawing at every size, from the end of a
 * quest's bar to the chest's own screen.
 *
 * The lid is a layer of its own so it can pop open (`lid`, a style with the
 * transform), with a glow of gold under it (`light`, an opacity) as it does.
 * `open` draws it already open, for a chest whose Zêr has been taken.
 */

/** The panels, by tier; the gold and the outline are the same on every chest. */
const PANELS: Record<ChestTier, { face: string; shade: string }> = {
  common: { face: '#B9733A', shade: '#8C5126' },
  rare: { face: '#4A90D9', shade: '#2F6DB0' },
  epic: { face: '#8A6BE0', shade: '#6447B8' },
};
const GOLD = { band: '#F5C232', edge: '#D19A12', light: '#FFE48A' };
const INK = '#3B2412';

/** The drawing's own box: 120 wide, 100 tall. */
const VIEW = '0 0 120 100';
const RATIO = 100 / 120;

const LID = 'M12 50 V34 C12 20 26 14 60 14 C94 14 108 20 108 34 V50 Z';
const BODY = 'M14 50 H106 V83 Q106 90 99 90 H21 Q14 90 14 83 Z';
/** The sun's eight rays round the clasp's disc. */
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2;
  const p = (r: number) => `${(60 + Math.cos(a) * r).toFixed(2)} ${(56 + Math.sin(a) * r).toFixed(2)}`;
  return `M${p(5.6)} L${p(7.6)}`;
}).join(' ');

export function ChestArt({
  tier,
  size,
  open = false,
  lid,
  light,
  style,
}: {
  tier: ChestTier;
  /** how wide it is drawn; the height follows */
  size: number;
  open?: boolean;
  /** the lid's own motion, for a chest being opened */
  lid?: StyleProp<ViewStyle>;
  /** 0 → 1: the gold that shows under a lid lifting */
  light?: Animated.Value | Animated.AnimatedInterpolation<number>;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const clip = `chest-lid-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const panel = PANELS[tier];
  const height = size * RATIO;
  const opened: ViewStyle | null = open ? { transform: [{ translateY: -size * 0.16 }, { rotate: '-12deg' }] } : null;
  return (
    <View style={[{ width: size, height }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, opened, lid]}>
        <Svg width={size} height={height} viewBox={VIEW}>
          <Defs>
            <ClipPath id={clip}>
              <Path d={LID} />
            </ClipPath>
          </Defs>
          <Path d={LID} fill={panel.face} />
          <G clipPath={`url(#${clip})`}>
            <Rect x={12} y={40} width={96} height={10} fill={panel.shade} />
            <Rect x={24} y={10} width={12} height={40} fill={GOLD.band} />
            <Rect x={33} y={10} width={3} height={40} fill={GOLD.edge} />
            <Rect x={84} y={10} width={12} height={40} fill={GOLD.band} />
            <Rect x={93} y={10} width={3} height={40} fill={GOLD.edge} />
          </G>
          <Path d="M26 25 C36 19.5 48 18.5 58 18.5" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" fill="none" />
          <Path d={LID} fill="none" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
          <Rect x={11} y={43} width={98} height={8} rx={3} fill={GOLD.band} stroke={INK} strokeWidth={2} />
        </Svg>
      </Animated.View>
      {light || open ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: light ?? 1 }]}>
          <Svg width={size} height={height} viewBox={VIEW}>
            <Ellipse cx={60} cy={48} rx={40} ry={9} fill={GOLD.light} opacity={0.9} />
            <Ellipse cx={60} cy={44} rx={26} ry={12} fill={GOLD.light} opacity={0.45} />
          </Svg>
        </Animated.View>
      ) : null}
      <View style={StyleSheet.absoluteFill}>
        <Svg width={size} height={height} viewBox={VIEW}>
          <Ellipse cx={60} cy={94} rx={42} ry={4.5} fill="#000000" opacity={0.16} />
          <Path d={BODY} fill={panel.face} />
          <Path d="M14 79 H106 V83 Q106 90 99 90 H21 Q14 90 14 83 Z" fill={panel.shade} />
          <Path d="M16 66 H104" stroke={panel.shade} strokeWidth={1.5} strokeOpacity={0.7} />
          <Rect x={24} y={50} width={12} height={40} fill={GOLD.band} />
          <Rect x={33} y={50} width={3} height={40} fill={GOLD.edge} />
          <Rect x={84} y={50} width={12} height={40} fill={GOLD.band} />
          <Rect x={93} y={50} width={3} height={40} fill={GOLD.edge} />
          <Path d={BODY} fill="none" stroke={INK} strokeWidth={2.5} strokeLinejoin="round" />
          <Rect x={49} y={45} width={22} height={22} rx={6} fill={GOLD.band} stroke={INK} strokeWidth={2} />
          <Ellipse cx={60} cy={56} rx={4} ry={4} fill={GOLD.light} />
          <Path d={RAYS} stroke={GOLD.light} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      </View>
    </View>
  );
}
