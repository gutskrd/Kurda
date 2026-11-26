import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Whether the reader asked for less transparency (iOS): glass is then drawn solid, and nothing lenses what is under it. */
export function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceTransparencyEnabled?.()
      .then((on) => {
        if (live) setReduce(on);
      })
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', setReduce);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return reduce;
}
