import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  DEER_BOARD_TEXT,
  DEER_INK,
  DEER_PIVOTS,
  DEER_VIEW,
  deerAntlers,
  deerBoard,
  deerCard,
  deerEarLeft,
  deerEarRight,
  deerEyes,
  deerFace,
  deerSmileFor,
  deerTiltFor,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';

/**
 * Hevalo the deer — the logo's deer — holding up a wooden board.
 *
 * The drawing is shared with the browser (`@kurda/shared` deer.ts), so it is
 * one character on both: the logo's chunky antlers, leaf ears, big white eyes
 * and soft nose. It holds the rating board with its five stars, or a sign with
 * the letters it wants you to be able to type.
 *
 * Alive but calm: it bobs a little, blinks, and now and then twitches an ear.
 * As stars are chosen the board tips up and the smile grows — it never frowns,
 * because a low rating is somebody being kind enough to tell us, and a sad
 * mascot would make them feel bad for it (house guidance: no guilt-tripping
 * mascot). With Reduce Motion on, it simply stands still.
 *
 * The parts that move are separate drawings stacked on top of each other, each
 * in its own Animated.View, because React Native animates views, not the
 * shapes inside an SVG. Every layer shares one frame, so they line up.
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
  const blink = useRef(new Animated.Value(1)).current;
  const earL = useRef(new Animated.Value(0)).current;
  const earR = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(tiltFor(stars))).current;
  const hop = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== 'web';

  // the idle loop: a slow bob, a blink every few seconds, an ear now and then
  useEffect(() => {
    if (reduce) {
      bob.setValue(0);
      blink.setValue(1);
      earL.setValue(0);
      earR.setValue(0);
      return;
    }
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(bob, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ]),
    );
    const blinkLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(3200),
        Animated.timing(blink, { toValue: 0.1, duration: 70, useNativeDriver: native }),
        Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: native }),
        Animated.delay(1700),
        Animated.timing(blink, { toValue: 0.1, duration: 70, useNativeDriver: native }),
        Animated.timing(blink, { toValue: 1, duration: 90, useNativeDriver: native }),
      ]),
    );
    const twitch = (ear: Animated.Value, dir: number) =>
      Animated.sequence([
        Animated.timing(ear, { toValue: dir, duration: 90, useNativeDriver: native }),
        Animated.timing(ear, { toValue: 0, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      ]);
    const earLoop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        twitch(earR, 1),
        Animated.delay(3900),
        twitch(earL, -1),
        Animated.delay(800),
      ]),
    );
    bobLoop.start();
    blinkLoop.start();
    earLoop.start();
    return () => {
      bobLoop.stop();
      blinkLoop.stop();
      earLoop.stop();
    };
  }, [reduce, bob, blink, earL, earR, native]);

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
        <View style={StyleSheet.absoluteFill}>{layer(deerAntlers(id))}</View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transformOrigin: originOf(DEER_PIVOTS.earLeft),
              transform: [{ rotate: earL.interpolate({ inputRange: [-1, 0], outputRange: ['-14deg', '0deg'] }) }],
            },
          ]}
        >
          {layer(deerEarLeft(id))}
        </Animated.View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transformOrigin: originOf(DEER_PIVOTS.earRight),
              transform: [{ rotate: earR.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '14deg'] }) }],
            },
          ]}
        >
          {layer(deerEarRight(id))}
        </Animated.View>
        <View style={StyleSheet.absoluteFill}>{layer(deerFace(id, stars))}</View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transformOrigin: originOf(DEER_PIVOTS.eyes), transform: [{ scaleY: blink }] },
          ]}
        >
          {layer(deerEyes(id))}
        </Animated.View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transformOrigin: originOf(DEER_PIVOTS.board),
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

/**
 * How far the corners of the mouth lift, by stars: a small kind smile with
 * none, a big open one at five. Never below zero — the deer does not frown.
 */
export const smileFor = deerSmileFor;
