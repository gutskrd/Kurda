import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo, timing } from './animate';
import { Icon } from './Icon';
import { useTheme } from './ThemeProvider';
import { LIP, TILE_EDGE, tileButtonTone, tileTone, type TileButtonTone, type TileState, type TileTone } from './tileTones';
import { radii, spacing, typography } from './tokens';

export { LIP, type TileState } from './tileTones';

/** How long the light takes to cross a tile that has just been answered right. */
const SWEEP_MS = 480;

/**
 * A face sinking onto its lip under a finger, and coming back up on a spring
 * as it is let go: on the native driver, and stopped wherever it is by the
 * next touch. Under Reduce Motion it does not travel — it is simply down while
 * held and up when let go.
 */
function useSink(enabled: boolean): { translateY: Animated.AnimatedInterpolation<number>; onPressIn: () => void; onPressOut: () => void } {
  const reduce = useReducedMotion();
  const sink = useRef(new Animated.Value(0)).current;
  const to = useCallback(
    (value: number) => {
      sink.stopAnimation();
      if (reduce) sink.setValue(value);
      else springTo(sink, value, 'release').start();
    },
    [reduce, sink],
  );
  // a tile that cannot be pressed any more (answered, used up) stands back up on its lip
  useEffect(() => {
    if (!enabled) to(0);
  }, [enabled, to]);
  // clamped, so the spring's bounce never takes the face through its lip or off it
  const translateY = sink.interpolate({ inputRange: [0, 1], outputRange: [0, LIP], extrapolate: 'clamp' });
  return { translateY, onPressIn: () => (enabled ? to(1) : undefined), onPressOut: () => to(0) };
}

/** The face on its lip: what a tile and a lesson button both are. */
function Chunk({
  tone,
  translateY,
  faceStyle,
  onFaceLayout,
  children,
}: {
  tone: TileTone;
  translateY: Animated.AnimatedInterpolation<number>;
  faceStyle?: StyleProp<ViewStyle>;
  onFaceLayout?: (e: LayoutChangeEvent) => void;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <>
      {tone.lip ? <View style={[styles.lip, { backgroundColor: tone.lip }]} /> : null}
      <Animated.View
        onLayout={onFaceLayout}
        style={[styles.face, { backgroundColor: tone.face, borderColor: tone.edge, transform: [{ translateY }] }, faceStyle]}
      >
        {children}
      </Animated.View>
    </>
  );
}

export interface TileProps {
  state?: TileState;
  /** the words on it; or `children`, given the ink to draw them in */
  label?: string;
  children?: ReactNode | ((ink: string) => ReactNode);
  onPress?: () => void;
  /** not pressable for now, though it keeps its colours: an answer already graded */
  disabled?: boolean;
  /** a light crosses it and a spark shines at its corner as it turns right: a pair just made */
  sweep?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  ref?: Ref<View>;
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * A chunky tile that looks pressable and is: a rounded face with a 2-point
 * edge, standing on a darker 4-point lip it sinks onto when pressed. The
 * lesson's cards, options and word tiles are all one of these, so they feel
 * the same under a finger.
 *
 * Its state is told by its colours — the brand's ink when picked, green when
 * right, red when wrong — and by more than colour: a spent tile has lost its
 * lip and greyed, a disabled one is faded, and each says its state to a screen
 * reader. At least a fingertip tall. What a press feels like (a tick, a knock)
 * is the caller's to say, since only it knows what the press meant.
 */
export function Tile({
  state = 'idle',
  label,
  children,
  onPress,
  disabled = false,
  sweep = false,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  selected,
  style,
  faceStyle,
  textStyle,
  testID,
  ref,
  onLayout,
}: TileProps): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const tone = tileTone(colors, state);
  const pressable = !disabled && state !== 'spent' && state !== 'disabled' && !!onPress;
  const sink = useSink(pressable);

  // the light across a pair just made: once, as the tile turns right
  const light = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const before = useRef(state);
  useEffect(() => {
    const was = before.current;
    before.current = state;
    if (!sweep || reduce || state !== 'right' || was === 'right') return;
    light.setValue(0);
    // not stopped when the tile settles: the light finishes crossing whatever it turns into next
    timing(light, 1, SWEEP_MS, { easing: Easing.inOut(Easing.quad) }).start();
  }, [state, sweep, reduce, light]);
  useEffect(() => () => light.stopAnimation(), [light]);

  const band = Math.max(24, width * 0.3);
  // a light over a dark face shows more than the same light over a pale one
  const shine = colors.scheme === 'dark' ? 0.3 : 0.7;
  const content = typeof children === 'function' ? children(tone.ink) : children;
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      onPressIn={sink.onPressIn}
      onPressOut={sink.onPressOut}
      disabled={!pressable}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      aria-disabled={!pressable}
      // one of a set of options is checked; a card or a word tile is selected
      aria-checked={accessibilityRole === 'radio' ? (selected ?? state === 'picked') : undefined}
      aria-selected={accessibilityRole === 'radio' ? undefined : (selected ?? state === 'picked')}
      onLayout={onLayout}
      testID={testID}
      style={[styles.tile, state === 'disabled' && styles.faded, style]}
    >
      <Chunk tone={tone} translateY={sink.translateY} faceStyle={faceStyle} onFaceLayout={sweep ? (e) => setWidth(e.nativeEvent.layout.width) : undefined}>
        {label !== undefined ? <Text style={[styles.label, { color: tone.ink }, textStyle]}>{label}</Text> : content}
        {sweep && width > 0 ? (
          <View style={StyleSheet.absoluteFill} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Animated.View
              style={[
                styles.band,
                {
                  width: band,
                  opacity: light.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, shine, shine, 0] }),
                  transform: [{ translateX: light.interpolate({ inputRange: [0, 1], outputRange: [-band * 1.6, width + band * 0.6] }) }, { skewX: '-20deg' }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.spark,
                {
                  opacity: light.interpolate({ inputRange: [0, 0.35, 0.6, 1], outputRange: [0, 0, 1, 0] }),
                  transform: [{ scale: light.interpolate({ inputRange: [0.35, 0.6, 1], outputRange: [0.3, 1.15, 0.8], extrapolate: 'clamp' }) }],
                },
              ]}
            >
              <Icon name="sparkle" size={14} color={tone.edge} />
            </Animated.View>
          </View>
        ) : null}
      </Chunk>
    </Pressable>
  );
}

/**
 * A lesson's Check and Continue: a tile filled in its tone, as wide as the
 * screen, where the thumb already is. While there is nothing to check it is
 * flat and grey, and it says so to a screen reader; while an answer is on its
 * way it spins in place of its word and cannot be pressed twice.
 */
export function TileButton({
  label,
  onPress,
  tone = 'primary',
  busy = false,
  disabled = false,
  accessibilityLabel,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: TileButtonTone;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const off = busy || disabled;
  const tint = tileButtonTone(colors, tone, !disabled);
  const sink = useSink(!off);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={sink.onPressIn}
      onPressOut={sink.onPressOut}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      aria-disabled={off}
      aria-busy={busy}
      testID={testID}
      style={styles.tile}
    >
      <Chunk tone={tint} translateY={sink.translateY} faceStyle={styles.buttonFace}>
        {busy ? <ActivityIndicator color={tint.ink} /> : <Text style={[styles.buttonLabel, { color: tint.ink }]}>{label}</Text>}
      </Chunk>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // room under the face for its lip, kept whether the lip shows or not, so nothing moves when a tile is spent
  tile: { paddingBottom: LIP },
  lip: { position: 'absolute', top: LIP, left: 0, right: 0, bottom: 0, borderRadius: radii.lg },
  face: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: TILE_EDGE,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  faded: { opacity: 0.5 },
  label: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium, textAlign: 'center' },
  band: { position: 'absolute', top: -8, bottom: -8, left: 0, backgroundColor: 'rgba(255,255,255,0.75)' },
  spark: { position: 'absolute', right: spacing.sm, bottom: spacing.xs },
  // 50, what iOS gives the full-width button a screen is about
  buttonFace: { minHeight: 50, alignSelf: 'stretch' },
  buttonLabel: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, letterSpacing: 0.3 },
});
