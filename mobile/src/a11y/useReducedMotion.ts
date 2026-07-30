import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

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
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value: boolean) => setReduced(value),
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
