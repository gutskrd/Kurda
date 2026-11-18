import { AccessibilityInfo } from 'react-native';

/**
 * Where react-native-web differs from the phone in a way a component relies on: `AccessibilityInfo.addEventListener`
 * returns no subscription on the web, and `useReducedMotion` removes its subscription on unmount. `reduceMotion` says
 * what the "device" asks for. Call it at the top of a component test, after the mocks.
 */
export function patchReactNativeWeb({ reduceMotion = false }: { reduceMotion?: boolean } = {}): void {
  const info = AccessibilityInfo as unknown as Record<string, unknown>;
  info.addEventListener = () => ({ remove: () => undefined });
  info.isReduceMotionEnabled = async () => reduceMotion;
  info.announceForAccessibility = () => undefined;
}
