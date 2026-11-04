import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { PATH_GEOMETRY, PATH_MASCOT } from '@kurda/shared';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { useMotionAlive } from '../a11y/useMotionAlive';

/**
 * Hevalo beside the current stop on the path (`mascotSpot` places him): on
 * the side away from the stop's lean, level with it, so he never stands on
 * the line. He arrives as the path does (the character's own `arrive`), and
 * greets it once it is in view: a little hop and a rock on his feet, the way
 * a deer waves. After that he is left to his own habits — a blink, a glance
 * about, an ear — until he is tapped, which greets back and opens the stop he
 * stands by; and he cheers when coming back from a lesson finished a skill or
 * opened one.
 *
 * Whole, rather than a head in a tile: he is standing on the page beside the
 * stop, his feet level with its foot, not a picture of him. He is said by the
 * stop beside him already, so a screen reader passes him by; and on a screen
 * too narrow to leave him room beside the path, he stays away. The greeting
 * is two transforms on the native driver, played once, and not at all for a
 * phone that asks for less motion.
 */
export function PathMascot({
  x,
  stopY,
  flip,
  cheer,
  onPress,
}: {
  /** where his middle is across the unit's path, and the middle of the stop he stands by, in points */
  x: number;
  stopY: number;
  /** turned to face the stop on his start side */
  flip: boolean;
  /** what the path just did is worth a cheer */
  cheer: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const live = useMotionAlive();
  const rock = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const greeted = useRef(false);
  useEffect(() => {
    // once, when the path is first in view; a return from a lesson has its own moment (the cheer), not a greeting on top of it
    if (!live || greeted.current || cheer) return;
    greeted.current = true;
    const sway = (to: number, ms: number) =>
      Animated.timing(rock, { toValue: to, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false });
    const run = Animated.sequence([
      Animated.delay(WAVE_AT_MS),
      Animated.parallel([
        Animated.sequence([sway(-1, 160), sway(1, 240), sway(-0.6, 220), sway(0, 200)]),
        Animated.sequence([
          Animated.timing(hop, { toValue: 1, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false }),
          Animated.timing(hop, { toValue: 0, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true, isInteraction: false }),
        ]),
      ]),
    ]);
    run.start();
    return () => run.stop();
  }, [live, cheer, rock, hop]);
  const rotate = rock.interpolate({ inputRange: [-1, 1], outputRange: [`${-WAVE_DEG}deg`, `${WAVE_DEG}deg`] });
  const translateY = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -HOP] });
  return (
    <View
      style={[styles.spot, { left: x - PATH_MASCOT.size / 2, top: stopY + PATH_GEOMETRY.node / 2 - FULL + FEET }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="lp-mascot"
    >
      <Animated.View style={[styles.greeting, { transform: [{ translateY }, { rotate }] }]}>
        <SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="full" height={FULL} flip={flip} reaction={cheer ? 'cheer' : null} onPress={onPress} />
      </Animated.View>
    </View>
  );
}

/** Drawn whole, legs and all, at the scale of the lesson's head-to-waist figure (`PATH_MASCOT.size` to the tops of his legs). */
const FULL = 132;
/** How far below the stop's round his feet stand: on its lip, where the stop itself meets the page. */
const FEET = 12;
/** The greeting: when it starts after he is in view (after his own arrival), how far he rocks each way, and how high he hops. */
const WAVE_AT_MS = 700;
const WAVE_DEG = 6;
const HOP = 6;

/** Narrower than this, the path's sway leaves no room beside it for him. */
export const MASCOT_MIN_WIDTH = 340;

const styles = StyleSheet.create({
  spot: { position: 'absolute', width: PATH_MASCOT.size, alignItems: 'center' },
  // he rocks about his feet, which stay on the ground
  greeting: { transformOrigin: '50% 100%' },
});
