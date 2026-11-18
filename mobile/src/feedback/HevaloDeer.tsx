import { useEffect, useId, useRef } from 'react';
import { Animated, Easing, Image, Platform, StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { DEER_BOARD_PIVOT, DEER_BOARD_TEXT, DEER_INK, DEER_PICTURE, DEER_VIEW, deerBoard, deerCard, deerTiltFor } from '@kurda/shared';
import MASCOT from '../../assets/mascot-deer.png';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useMotionAlive } from '../a11y/useMotionAlive';

/**
 * Hevalo the deer from the app icon, holding up a wooden board: the rating board with five stars, or a sign with
 * letters. The deer is the icon's picture, with the board and forelegs drawn over it (`@kurda/shared` deer.ts),
 * as on the web.
 *
 * It bobs a little, and as stars are chosen the board tips up with a small hop, low with few and high with five,
 * never a frown. Still under Reduce Motion. The board is a separate drawing in its own Animated.View, because
 * React Native animates views, not shapes inside an SVG; both share one frame so they line up.
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
  /** Width in points; the drawing is a little taller than it is wide. */
  size?: number;
  board: DeerBoard;
  /** A little hop of joy (the keyboard try-it box, when all five letters are in). */
  cheer?: boolean;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const alive = useMotionAlive();
  const id = `deer-${useId().replace(/[^\w-]/g, '')}`;
  const height = (size * VB_H) / VB_W;
  const stars = board.kind === 'stars' ? Math.max(0, Math.min(5, Math.round(board.stars))) : 4;

  const bob = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(tiltFor(stars))).current;
  const hop = useRef(new Animated.Value(0)).current;
  const native = Platform.OS !== 'web';

  // The idle loop: a slow bob, only while the screen is in front and motion is wanted.
  useEffect(() => {
    if (!alive) {
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
  }, [alive, bob, native]);

  // More stars, the board tips up a little further, with a small hop each time.
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
      {/* The lilac card the logo's deer sits on, as a soft disc that does not move. */}
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
          {/* The letters use the system font, not SVG text: ç ê î ş û and the Soranî letters are what SVG text in an unknown font gets wrong. */}
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

/** The board's angle for a star count: tipped down to one side with none, level at three, raised jauntily at five. */
export const tiltFor = deerTiltFor;
