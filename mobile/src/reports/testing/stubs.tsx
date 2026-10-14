/**
 * Stand-ins for the native modules a component test cannot load.
 *
 * The phone's components are rendered in tests through react-native-web, in
 * jsdom. Packages that reach into native code (the secure store, the gradient
 * view, the safe-area context) are replaced with the smallest thing that keeps
 * the component's own behaviour intact: storage that remembers nothing, a
 * gradient that is a plain view, insets of zero.
 *
 * Each test file wires these with `vi.mock(…, () => import('…/testing/stubs'))`
 * (see `harness.tsx` for the list), because a mock has to be declared in the
 * test file itself to be hoisted above the imports it replaces.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

// expo-secure-store
export async function getItemAsync(): Promise<string | null> {
  return null;
}
export async function setItemAsync(): Promise<void> {}
export async function deleteItemAsync(): Promise<void> {}

// expo-linear-gradient
export function LinearGradient({ children, style }: { children?: ReactNode; style?: unknown }): React.JSX.Element {
  return <View style={style as never}>{children}</View>;
}

// react-native-safe-area-context
export function useSafeAreaInsets(): { top: number; bottom: number; left: number; right: number } {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}
export function SafeAreaProvider({ children }: { children?: ReactNode }): React.JSX.Element {
  return <>{children}</>;
}
export function SafeAreaView({ children, style }: { children?: ReactNode; style?: unknown }): React.JSX.Element {
  return <View style={style as never}>{children}</View>;
}
