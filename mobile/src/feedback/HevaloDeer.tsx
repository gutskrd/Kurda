import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { DEER_BOARD_PIVOT, DEER_BOARD_TEXT, DEER_INK, DEER_PICTURE, DEER_VIEW, deerBoard, deerCard, deerTiltFor } from '@kurda/shared';
import MASCOT from '../../assets/mascot-deer.png';
import { useReducedMotion } from '../a11y/useReducedMotion';

/**
 * Hevalo the deer — the mascot from the app icon — holding up a wooden board.
 *
 * The deer is the icon's own picture, so it is exactly the mascot; the board
 * and the forelegs that hold it are drawn over it (`@kurda/shared` deer.ts),
 * the same as in the browser. It holds the rating board with its five stars,
 * or a sign with the letters it wants you to be able to type.
 *
 * Alive but calm: it bobs a little, and as stars are chosen the board tips up
 * with a small hop — down a little with few, held up high with five, never a
 * frown. With Reduce Motion on, it simply stands still.
 *
 * The board is its own drawing over the picture, in its own Animated.View,
 * because React Native animates views, not the shapes inside an SVG. Both use
 * one frame, so they line up.
 */

/** The drawing's own coordinates; the layers all use these. */
const VB_W = DEER_VIEW.w;
const VB_H = DEER_VIEW.h;

/** A view's transform origin for a point in the frame, as percentages. */
const originOf = (p: { x: number; y: number }): string => `${(p.x / VB_W) * 100}% ${(p.y / VB_H) * 100}%`;

export type DeerBoard = { kind: 'stars'; stars: number } | { kind: 'letters'; letters: string };

export function HevaloDeer({
  size = 150,
  board,
  cheer = false,
}: {
  /** width in points; the drawing is a little taller than it is wide */
  size?: number;
  board: DeerBoard;
  /** a little hop of joy (the keyboard try-it box, when all five letters are in) */
  cheer?: boolean;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const id = `deer-${useId().replace(/[^\w-]/g, '')}`;
  const height = (size * VB_H) / VB_W;
  const stars = board.kind === 'stars' ? Math.max(0, Math.min(5, Math.round(board.stars))) : 4;

  const bob = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(tiltFor(stars))).current;
  const hop = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== 'web';

  // the idle loop: a slow bob
  useEffect(() => {
    if (reduce) {
      bob.setValue(0);
      return;
    }
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(bob, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    bobLoop.start();
    return () => bobLoop.stop();
  }, [reduce, bob, native]);

  // more stars, the board tips up a little further, with a small hop each time
  useEffect(() => {
    const to = tiltFor(stars);
    if (reduce) {
      tilt.setValue(to);
      return;
    }
    Animated.parallel([
      Animated.spring(tilt, { toValue: to, friction: 5, tension: 120, useNativeDriver: native }),
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(hop, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: native }),
      ]),
    ]).start();
  }, [stars, reduce, tilt, hop, native]);

  useEffect(() => {
    if (!cheer || reduce) return;
    Animated.sequence([
      Animated.timing(hop, { toValue: 2.5, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      Animated.timing(hop, { toValue: 0, duration: 260, easing: Easing.bounce, useNativeDriver: native }),
    ]).start();
  }, [cheer, reduce, hop, native]);

  const layer = (markup: string) => (
    <SvgXml xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}">${markup}</svg>`} width={size} height={height} />
  );

  const lift = Animated.add(
    bob.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }),
    hop.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }),
  );

  return (
    <View
      style={{ width: size, height }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {/* the lilac card the logo's deer sits on, as a soft disc that does not move */}
      <View style={StyleSheet.absoluteFill}>{layer(deerCard())}</View>

      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: lift }] }]}>
        <Image
          source={MASCOT}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: (DEER_PICTURE.x / VB_W) * size,
            top: (DEER_PICTURE.y / VB_H) * height,
            width: (DEER_PICTURE.w / VB_W) * size,
            height: (DEER_PICTURE.h / VB_H) * height,
          }}
        />
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transformOrigin: originOf(DEER_BOARD_PIVOT),
              transform: [{ rotate: tilt.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] }) }],
            },
          ]}
        >
          {layer(deerBoard(id, board.kind === 'stars' ? { kind: 'stars', stars } : { kind: 'letters' }))}
          {/*
            The letters are the system font's, not the SVG's: ç ê î ş û (and
            the Soranî letters) are exactly what an SVG text element in an
            unknown font gets wrong.
          */}
          {board.kind === 'letters' ? (
            <View
              style={{
                position: 'absolute',
                left: (DEER_BOARD_TEXT.x / VB_W) * size,
                top: (DEER_BOARD_TEXT.y / VB_H) * height,
                width: (DEER_BOARD_TEXT.w / VB_W) * size,
                height: (DEER_BOARD_TEXT.h / VB_H) * height,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: DEER_INK, fontSize: size * 0.115, fontWeight: '700', letterSpacing: size * 0.012 }}>
                {board.letters}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/**
 * The board's angle for a number of stars: tipped down and to one side with
 * none chosen, level at three, held up at a jaunty angle at five.
 */
export const tiltFor = deerTiltFor;
