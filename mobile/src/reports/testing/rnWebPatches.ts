import { AccessibilityInfo } from 'react-native';

/**
 * Where react-native-web differs from the phone in a way a component relies on.
 *
 * `AccessibilityInfo.addEventListener` returns a subscription with `remove()`
 * on iOS and Android; on the web it returns nothing, and `useReducedMotion`
 * removes its subscription on unmount. `reduceMotion` says what the "device"
 * asks for, so a test can check both the animation and its reduced-motion fade.
 *
 * Call it at the top of a component test, after the mocks (it patches the
 * react-native-web object the mocked `react-native` resolves to).
 */
export function patchReactNativeWeb({ reduceMotion = false }: { reduceMotion?: boolean } = {}): void {
  const info = AccessibilityInfo as unknown as Record<string, unknown>;
  info.addEventListener = () => ({ remove: () => undefined });
  info.isReduceMotionEnabled = async () => reduceMotion;
  info.announceForAccessibility = () => undefined;
}
