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

// expo-notifications: the phone's answer is whatever a test puts in
// `notificationsStub`, and asking turns it into `afterRequest`, as the system
// prompt would. Everything else listens to nothing and clears nothing.
interface PermissionAnswerStub {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
}
export const notificationsStub: { permission: PermissionAnswerStub; afterRequest: PermissionAnswerStub; requests: number } = {
  permission: { status: 'undetermined', granted: false, canAskAgain: true },
  afterRequest: { status: 'granted', granted: true, canAskAgain: true },
  requests: 0,
};
export async function getPermissionsAsync(): Promise<PermissionAnswerStub> {
  return { ...notificationsStub.permission };
}
export async function requestPermissionsAsync(): Promise<PermissionAnswerStub> {
  notificationsStub.requests += 1;
  notificationsStub.permission = { ...notificationsStub.afterRequest };
  return { ...notificationsStub.permission };
}
export const AndroidImportance = { DEFAULT: 3 };
export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';
export async function setNotificationChannelAsync(): Promise<null> {
  return null;
}
export function setNotificationHandler(): void {}
export function addNotificationResponseReceivedListener(): { remove: () => void } {
  return { remove: () => undefined };
}
export function getLastNotificationResponse(): null {
  return null;
}
export function clearLastNotificationResponse(): void {}
export async function setBadgeCountAsync(): Promise<boolean> {
  return true;
}
