import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { giftLoopMoves, giftLoopPicture, type GiftLoopKey, type GiftLoopLayer } from '@kurda/shared';
import { assetUrl } from '../api/env';
import { useScreenAwake } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useGiftLoopPlace, useGiftLoopTurn } from './loopStage';

/**
 * A gift's picture, alive when it has a round (shared art/gift-loop.ts) and `play` asks for it: its parts are stacked
 * over the still as separate pictures on the same frame and moved on the native driver, as the gift box is, so nothing
 * is drawn again. It plays only while it is on screen (its list row in view) with its screen in front, and only if it
 * is among the few most in view (loopStage.tsx); otherwise it stops and shows the still, which is the round's first
 * frame, so starting and stopping cannot be seen. Under Reduce Motion, or for any other picture, it is the still.
 * Decorative: the words beside it say what it is.
 */
export function GiftArt({
  path,
  size,
  play = true,
  style,
  imageStyle,
  onError,
  testID,
}: {
  /** The site path the API sends (`/cosmetics/gifts/…`), or a full address. */
  path: string | null | undefined;
  /** Its width and height in points. */
  size: number;
  play?: boolean;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  onError?: () => void;
  testID?: string;
}): React.JSX.Element | null {
  const uri = assetUrl(path);
  const reduce = useReducedMotion();
  const awake = useScreenAwake();
  const picture = useMemo(() => (play && !reduce ? giftLoopPicture(uri) : null), [uri, play, reduce]);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  const place = useGiftLoopPlace();
  const onScreen = place > 0;
  // The parts are fetched only once the gift has been on screen, and kept after.
  const [seen, setSeen] = useState(onScreen);
  if (onScreen && !seen) setSeen(true);
  const parts = picture ? picture.layers.length + (picture.base ? 1 : 0) : 0;
  const live = picture !== null && !failed && seen;
  const ready = live && loaded >= parts;
  const playing = useGiftLoopTurn(ready && awake && onScreen, place);
  const unit = size / 120;

  // A clock for each length of round among the layers, run only while the parts are in and the screen is in front.
  const clocks = useMemo(() => new Map((picture?.layers ?? []).map(({ layer }) => [layer.ms, new Animated.Value(0)])), [picture]);
  useEffect(() => {
    setLoaded(0);
    setFailed(false);
  }, [picture]);
  useEffect(() => {
    if (!playing) return;
    const runs = [...clocks].map(([ms, value]) =>
      Animated.loop(Animated.timing(value, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true, isInteraction: false })),
    );
    runs.forEach((r) => r.start());
    return () => {
      runs.forEach((r) => r.stop());
      // Stopped on the round's first frame, which is the still.
      clocks.forEach((value) => value.setValue(0));
    };
  }, [playing, clocks]);

  if (!uri) return null;
  const onLoad = (): void => setLoaded((n) => n + 1);
  const onFail = (): void => setFailed(true);
  return (
    <View style={[{ width: size, height: size }, style]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      <Image
        source={{ uri }}
        style={[StyleSheet.absoluteFill, imageStyle, playing ? styles.hidden : null]}
        resizeMode="contain"
        onError={onError}
        accessibilityIgnoresInvertColors
        testID={testID ? `${testID}-still` : undefined}
      />
      {live && picture ? (
        <View style={[StyleSheet.absoluteFill, playing ? null : styles.hidden]} testID={testID ? `${testID}-parts` : undefined}>
          {picture.base ? <Image source={{ uri: picture.base }} style={StyleSheet.absoluteFill} onLoad={onLoad} onError={onFail} accessibilityIgnoresInvertColors /> : null}
          {picture.layers.map(({ layer, src }) => (
            <Part key={layer.name} layer={layer} src={src} unit={unit} clock={clocks.get(layer.ms)!} onLoad={onLoad} onError={onFail} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

type Motion = Animated.WithAnimatedObject<ViewStyle>;

/** One layer in its own box over the frame, moved, turned and scaled about its origin along its keys. */
function Part({
  layer,
  src,
  unit,
  clock,
  onLoad,
  onError,
}: {
  layer: GiftLoopLayer;
  src: string;
  unit: number;
  clock: Animated.Value;
  onLoad: () => void;
  onError: () => void;
}): React.JSX.Element {
  const motion = useMemo(() => styleOf(layer, clock, unit), [layer, clock, unit]);
  const [x, y, w, h] = layer.box;
  const [ox, oy] = layer.origin;
  const place: ViewStyle = { position: 'absolute', left: x * unit, top: y * unit, width: w * unit, height: h * unit, transformOrigin: `${(ox - x) * unit}px ${(oy - y) * unit}px` };
  return (
    <Animated.View style={[place, motion]} pointerEvents="none">
      <Image source={{ uri: src }} style={{ width: w * unit, height: h * unit }} onLoad={onLoad} onError={onError} accessibilityIgnoresInvertColors />
    </Animated.View>
  );
}

/** A layer's keys as a style on its clock running 0 to 1: only what changes along them is interpolated. */
function styleOf(layer: GiftLoopLayer, clock: Animated.Value, unit: number): Motion {
  const keys = layer.keys;
  const inputRange = keys.map((k) => k.at);
  const along = (pick: (k: GiftLoopKey) => number): Animated.AnimatedInterpolation<number> | number => {
    const out = keys.map(pick);
    return out.every((v) => v === out[0]) ? (out[0] ?? 0) : clock.interpolate({ inputRange, outputRange: out, extrapolate: 'clamp' });
  };
  const opacity = along((k) => k.o);
  if (!giftLoopMoves(layer)) return { opacity } as Motion;
  const rots = keys.map((k) => k.rot);
  const rotate = rots.every((v) => v === rots[0]) ? `${rots[0] ?? 0}deg` : clock.interpolate({ inputRange, outputRange: rots.map((r) => `${r}deg`), extrapolate: 'clamp' });
  const p = layer.plane;
  const turn = p ? [{ rotate: `${p.tilt}deg` }, { scaleY: p.squash }, { rotate }, { scaleY: 1 / p.squash }, { rotate: `${-p.tilt}deg` }] : [{ rotate }];
  return {
    opacity,
    transform: [{ translateX: along((k) => k.x * unit) }, { translateY: along((k) => k.y * unit) }, ...turn, { scaleX: along((k) => k.sx) }, { scaleY: along((k) => k.sy) }],
  } as Motion;
}

const styles = StyleSheet.create({
  hidden: { opacity: 0 },
});
