import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import { GIFT_REDUCED_MOTION_MS, type GiftTier } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useDirection } from '../reports/direction';
import { timing } from '../theme/animate';
import { useTheme } from '../theme/ThemeProvider';
import { GiftBox } from './art';
import { SEND_FLY_MS } from './motion';

/** How far to the side the gift swings on its way down, in points: enough to bend its path, no more. */
const ARC = 44;

/**
 * A sent gift, wrapped, flying into the chat.
 *
 * The present appears in the middle of the screen, settles, and is tossed
 * toward the conversation where its bubble now is — so the sender sees it go,
 * rather than a sheet closing on nothing. It goes on an arc, as a thing thrown
 * does: across first, towards the side your own messages are on, and then
 * down faster and faster, leaning the way it goes. It used to fall in a
 * straight line. With Reduce Motion it fades in and out where it is. It never
 * takes a tap (the screen under it stays usable) and says what happened once,
 * for screen readers.
 */
export function GiftSendAnimation({
  tier,
  announce,
  onDone,
}: {
  tier: GiftTier;
  /** said aloud: "Gift sent to Rojda" */
  announce: string;
  onDone: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const appear = useRef(new Animated.Value(0)).current;
  const fly = useRef(new Animated.Value(0)).current;
  // sideways, on a curve of its own: it has moved across before the fall has got going, so the path is an arc and not a drop
  const across = useRef(new Animated.Value(0)).current;
  // towards the side your own messages sit on, which is where it lands in the chat
  const side = useDirection().row === 'row-reverse' ? -1 : 1;
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(announce);
    const half = reduce ? GIFT_REDUCED_MOTION_MS : SEND_FLY_MS / 2;
    const run = Animated.sequence([
      Animated.timing(appear, {
        toValue: 1,
        duration: reduce ? GIFT_REDUCED_MOTION_MS : SEND_FLY_MS * 0.35,
        easing: reduce ? Easing.linear : Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
      Animated.delay(reduce ? 400 : SEND_FLY_MS * 0.15),
      Animated.parallel([
        timing(fly, 1, half, { easing: Easing.in(Easing.cubic) }),
        reduce ? Animated.delay(0) : timing(across, 1, half, { easing: Easing.out(Easing.quad) }),
      ]),
    ]);
    run.start(() => done.current());
    return () => run.stop();
  }, [announce, appear, fly, across, reduce]);

  const opacity = reduce
    ? Animated.multiply(appear, fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }))
    : fly.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  const transform = reduce
    ? []
    : [
        { translateX: across.interpolate({ inputRange: [0, 1], outputRange: [0, ARC * side] }) },
        { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, 260] }) },
        { scale: Animated.multiply(appear, fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] })) },
        // leaning into the way it is going
        { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${12 * side}deg`] }) },
      ];

  return (
    <View style={styles.overlay} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={{ opacity, transform }}>
        <GiftBox size={150} tier={tier} gold={colors.gold} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
