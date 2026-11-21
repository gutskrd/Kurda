import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Pressable, type Reach, type ReachSize } from './Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo, timing } from './animate';
import { Icon } from './Icon';
import { useTheme } from './ThemeProvider';
import { LIP, TILE_EDGE, tileButtonTone, tileTone, type TileButtonTone, type TileState, type TileTone } from './tileTones';
import { radii, spacing, typography } from './tokens';

export { LIP, type TileState } from './tileTones';

/** The tile colours, by state, of a place with its own look (a lesson's valley); the palette's own (`tileTone`) otherwise. */
export interface TileLook {
  tile: (state: TileState) => TileTone;
  button: (tone: TileButtonTone, enabled: boolean) => TileTone;
}

const TileLookContext = createContext<TileLook | null>(null);

/** Draws every tile and lesson button inside in `look`. */
export function TileLookScope({ look, children }: { look: TileLook; children: ReactNode }): React.JSX.Element {
  return <TileLookContext.Provider value={look}>{children}</TileLookContext.Provider>;
}

/** How long the light takes to cross a tile just answered right. */
const SWEEP_MS = 480;

/** The light crossing a tile, one white for every face (a join code's glint uses it too). */
export const SHINE = 'rgba(255,255,255,0.75)';

/**
 * A face sinking onto its lip under a finger and springing back up on release, on the native driver and interruptible
 * by the next touch. Under Reduce Motion it jumps between down while held and up when released.
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
  // A tile that can no longer be pressed (answered, used up) stands back up on its lip.
  useEffect(() => {
    if (!enabled) to(0);
  }, [enabled, to]);
  // Clamped, so the spring's bounce never takes the face through or off its lip.
  const translateY = sink.interpolate({ inputRange: [0, 1], outputRange: [0, LIP], extrapolate: 'clamp' });
  return { translateY, onPressIn: () => (enabled ? to(1) : undefined), onPressOut: () => to(0) };
}

/** The face on its lip, which both a tile and a lesson button are. */
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
  // The lip follows the face's corners, where a caller rounds them differently.
  const corner = StyleSheet.flatten(faceStyle)?.borderRadius;
  return (
    <>
      {tone.lip ? <View style={[styles.lip, { backgroundColor: tone.lip }, corner !== undefined && { borderRadius: corner }]} /> : null}
      <Animated.View
        onLayout={onFaceLayout}
        style={[styles.face, { backgroundColor: tone.face, borderColor: tone.edge, transform: [{ translateY }] }, faceStyle]}
      >
        {children}
      </Animated.View>
    </>
  );
}

interface TileProps {
  state?: TileState;
  /** The label; or `children`, given the ink to draw them in. */
  label?: string;
  children?: ReactNode | ((ink: string) => ReactNode);
  onPress?: () => void;
  /** Not pressable for now but keeping its colours: an answer already graded. */
  disabled?: boolean;
  /** A light crosses it and a spark shines at its corner as it turns right: a pair just made. */
  sweep?: boolean;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** The language its label is read in, when not the app's: a story's own words on an answer. */
  accessibilityLanguage?: string;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  ref?: Ref<View>;
  onLayout?: (e: LayoutChangeEvent) => void;
  /**
   * How far past its face it answers a finger (theme/Pressable.tsx): nothing extra by default, since it is a fingertip
   * tall with its lip; `reachSize` for smaller ones, `open` when nothing is near.
   */
  reach?: Reach;
  reachSize?: ReachSize;
}

/**
 * A chunky tile that looks pressable and is: a rounded face with a 2-point edge on a darker 4-point lip it sinks onto
 * when pressed. Lesson cards, options and word tiles, and story quiz answers, all use it, so answers feel the same
 * everywhere. Its state shows in colour (brand ink when picked, green right, red wrong) and beyond colour (a spent
 * tile loses its lip and greys, a disabled one fades), and is announced to screen readers. At least a fingertip
 * tall. The caller chooses the haptic, since only it knows what the press meant.
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
  accessibilityLanguage,
  selected,
  style,
  faceStyle,
  textStyle,
  testID,
  ref,
  onLayout,
  reach,
  reachSize,
}: TileProps): React.JSX.Element {
  const { colors } = useTheme();
  const look = useContext(TileLookContext);
  const reduce = useReducedMotion();
  const tone = look ? look.tile(state) : tileTone(colors, state);
  const pressable = !disabled && state !== 'spent' && state !== 'disabled' && !!onPress;
  const sink = useSink(pressable);

  // The light across a pair just made: once, as the tile turns right.
  const light = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const before = useRef(state);
  useEffect(() => {
    const was = before.current;
    before.current = state;
    if (!sweep || reduce || state !== 'right' || was === 'right') return;
    light.setValue(0);
    // Not stopped when the tile settles: the light finishes crossing whatever it becomes.
    timing(light, 1, SWEEP_MS, { easing: Easing.inOut(Easing.quad) }).start();
  }, [state, sweep, reduce, light]);
  useEffect(() => () => light.stopAnimation(), [light]);

  const band = Math.max(24, width * 0.3);
  // Light shows more over a dark face than a pale one.
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
      accessibilityLanguage={accessibilityLanguage}
      aria-disabled={!pressable}
      // One of a set of options is checked; a card or word tile is selected.
      aria-checked={accessibilityRole === 'radio' ? (selected ?? state === 'picked') : undefined}
      aria-selected={accessibilityRole === 'radio' ? undefined : (selected ?? state === 'picked')}
      onLayout={onLayout}
      testID={testID}
      reach={reach}
      reachSize={reachSize}
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
 * A lesson's Check and Continue: a full-width tile filled in its tone, where the thumb already is. With nothing to
 * check it is flat and grey and says so to screen readers; while an answer is in flight it spins instead of its
 * label and cannot be pressed twice.
 */
export function TileButton({
  label,
  onPress,
  tone = 'primary',
  busy = false,
  disabled = false,
  accessibilityLabel,
  testID,
  reach,
  reachSize,
}: {
  label: string;
  onPress: () => void;
  tone?: TileButtonTone;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  /** As a tile's: at 54 tall with its lip it needs no extra reach, unless a caller draws it smaller. */
  reach?: Reach;
  reachSize?: ReachSize;
}): React.JSX.Element {
  const { colors } = useTheme();
  const look = useContext(TileLookContext);
  const off = busy || disabled;
  const tint = look ? look.button(tone, !disabled) : tileButtonTone(colors, tone, !disabled);
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
      reach={reach}
      reachSize={reachSize}
      style={styles.tile}
    >
      <Chunk tone={tint} translateY={sink.translateY} faceStyle={styles.buttonFace}>
        {busy ? <ActivityIndicator color={tint.ink} /> : <Text style={[styles.buttonLabel, { color: tint.ink }]}>{label}</Text>}
      </Chunk>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Room under the face for its lip, kept whether or not the lip shows, so nothing moves when a tile is spent.
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
  label: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium, textAlign: 'center' },
  band: { position: 'absolute', top: -8, bottom: -8, left: 0, backgroundColor: SHINE },
  spark: { position: 'absolute', right: spacing.sm, bottom: spacing.xs },
  // 50, which iOS gives a screen's full-width main button.
  buttonFace: { minHeight: 50, alignSelf: 'stretch' },
  buttonLabel: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 0.3 },
});
