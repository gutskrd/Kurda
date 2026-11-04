import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useLive } from '../coursemap/live';

/**
 * A chest that can be opened, asking to be: every few seconds it rocks on
 * its base — a quick shake, like something knocking from inside — and rests.
 * Only while `active` (a chest with Zêr in it, not opened yet), and only
 * while the screen is in front and the phone has not asked for less motion
 * (`useLive`): a shut chest and an opened one sit still, and so does a
 * waiting one on a screen nobody is looking at. One rotation on the native
 * driver, about the chest's foot. `testID` is on it only while it moves, so
 * a test can count the chests that are shaking.
 */
export function ChestWobble({ active, children, testID }: { active: boolean; children: ReactNode; testID?: string }): React.JSX.Element {
  const live = useLive();
  const moving = active && live;
  const tilt = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!moving) {
      tilt.setValue(0);
      return;
    }
    const to = (value: number, ms: number) =>
      Animated.timing(tilt, { toValue: value, duration: ms, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false });
    const loop = Animated.loop(Animated.sequence([Animated.delay(REST_MS), to(-1, 90), to(1, 150), to(-0.7, 140), to(0.5, 130), to(-0.25, 110), to(0, 100)]));
    loop.start();
    return () => {
      loop.stop();
      tilt.setValue(0);
    };
  }, [moving, tilt]);
  const rotate = tilt.interpolate({ inputRange: [-1, 1], outputRange: [`${-TILT_DEG}deg`, `${TILT_DEG}deg`] });
  return (
    <Animated.View style={[styles.base, { transform: [{ rotate }] }]} testID={moving ? testID : undefined}>
      {children}
    </Animated.View>
  );
}

/** How long a chest rests between shakes, and how far it tips each way. */
const REST_MS = 2400;
const TILT_DEG = 8;

const styles = StyleSheet.create({
  // it rocks about its foot, which stays on the ground
  base: { transformOrigin: '50% 85%' },
});
