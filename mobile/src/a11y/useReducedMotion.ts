import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The setting as last read, for the next component that asks. The system is
 * asked asynchronously, so a component's first frame used to assume "no" —
 * long enough for a celebration mounted after a game to start its burst and
 * its haptic tick for somebody who had asked for none. A screen mounted after
 * the first answer starts from the right value.
 */
let lastKnown = false;

/**
 * Live "Reduce Motion" OS setting (KUR-266). Seeds from the current system
 * value and updates if the user toggles the setting while the app is open.
 * Feed the result into resolveMotion() to gate decorative animations:
 *
 *   const reduce = useReducedMotion();
 *   const { animate, durationMs } = resolveMotion(GLOBE_BREATH, reduce);
 *
 * Kept as a thin wrapper around AccessibilityInfo so the decision logic stays
 * in the pure, unit-tested motion module.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(lastKnown);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      lastKnown = value;
      if (mounted) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value: boolean) => {
        lastKnown = value;
        setReduced(value);
      },
    );
    return () => {
      mounted = false;
      // react-native-web hands back nothing where the browser has no matchMedia
      // (jsdom, an old WebView): there is then nothing to remove
      subscription?.remove();
    };
  }, []);

  return reduced;
}
