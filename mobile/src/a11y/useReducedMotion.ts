import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The setting as last read, so a component mounted later starts from it rather than from "no" for a frame. */
let lastKnown = false;

/** The live Reduce Motion setting, updated if it changes while the app is open. */
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
      // react-native-web returns no subscription where the browser has no matchMedia.
      subscription?.remove();
    };
  }, []);

  return reduced;
}
