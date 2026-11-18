import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { PATH_GEOMETRY, PATH_MASCOT } from '@kurda/shared';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { useMotionAlive } from '../a11y/useMotionAlive';

/**
 * Hevalo standing beside the current stop (`mascotSpot` places him), on the side away from the path's lean. He
 * greets once when the path comes into view, cheers after a lesson that finished or opened a skill, and opens his
 * stop when tapped. Screen readers skip him because the stop already speaks; he is hidden on narrow screens and
 * does not greet under Reduce Motion.
 */
export function PathMascot({
  x,
  stopY,
  flip,
  cheer,
  onPress,
}: {
  /** Horizontal centre of him and of his stop across the unit's path, in points. */
  x: number;
  stopY: number;
  /** Turns him to face a stop on his start side. */
  flip: boolean;
  /** The path just did something worth a cheer. */
  cheer: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const live = useMotionAlive();
  const rock = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const greeted = useRef(false);
  useEffect(() => {
    // A return from a lesson has its cheer, so it gets no greeting on top.
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

/** His full height, at the scale of the lesson's figure (`PATH_MASCOT.size` reaches the tops of his legs). */
const FULL = 132;
/** How far below the stop's centre his feet stand, on its lip. */
const FEET = 12;
/** The greeting's delay after he is in view, its rock angle, and its hop height. */
const WAVE_AT_MS = 700;
const WAVE_DEG = 6;
const HOP = 6;

/** Below this width the path leaves no room beside it for him. */
export const MASCOT_MIN_WIDTH = 340;

const styles = StyleSheet.create({
  spot: { position: 'absolute', width: PATH_MASCOT.size, alignItems: 'center' },
  // He rocks about his feet.
  greeting: { transformOrigin: '50% 100%' },
});
