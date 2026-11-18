/**
 * Stand-ins for the native modules a component test cannot load: tests render through react-native-web in jsdom, and
 * packages that reach into native code (secure store, gradient view, safe-area context) get the smallest replacement
 * that keeps the component's behaviour: storage that remembers nothing, a plain view, zero insets. Each test file wires
 * these with `vi.mock(…, () => import('…/testing/stubs'))` (see `harness.tsx`), since a mock must be declared in the
 * test file to be hoisted.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

// expo-secure-store.
export async function getItemAsync(): Promise<string | null> {
  return null;
}
export async function setItemAsync(): Promise<void> {}
export async function deleteItemAsync(): Promise<void> {}

// expo-linear-gradient.
export function LinearGradient({ children, style }: { children?: ReactNode; style?: unknown }): React.JSX.Element {
  return <View style={style as never}>{children}</View>;
}

// react-native-safe-area-context.
export function useSafeAreaInsets(): { top: number; bottom: number; left: number; right: number } {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}
export function SafeAreaProvider({ children }: { children?: ReactNode }): React.JSX.Element {
  return <>{children}</>;
}
export function SafeAreaView({ children, style }: { children?: ReactNode; style?: unknown }): React.JSX.Element {
  return <View style={style as never}>{children}</View>;
}

// expo-notifications: the permission is whatever a test puts in `notificationsStub`, and asking turns it into
// `afterRequest`, as the system prompt would. A test can make the request fail (`failRequest`) or hold the prompt until
// it says so (`prompt`; one that never settles is a phone that never answers). Everything else is a no-op.
interface PermissionAnswerStub {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
}
export const notificationsStub: {
  permission: PermissionAnswerStub;
  afterRequest: PermissionAnswerStub;
  requests: number;
  failRequest: boolean;
  prompt: Promise<void> | null;
} = {
  permission: { status: 'undetermined', granted: false, canAskAgain: true },
  afterRequest: { status: 'granted', granted: true, canAskAgain: true },
  requests: 0,
  failRequest: false,
  prompt: null,
};
export async function getPermissionsAsync(): Promise<PermissionAnswerStub> {
  return { ...notificationsStub.permission };
}
export async function requestPermissionsAsync(): Promise<PermissionAnswerStub> {
  notificationsStub.requests += 1;
  if (notificationsStub.failRequest) throw new Error('the phone could not ask');
  if (notificationsStub.prompt) await notificationsStub.prompt;
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

/** expo-clipboard: what was last copied, for a test to read (testing/setup.ts mocks the module with this). */
export const clipboardStub: { text: string | null } = { text: null };
export async function setStringAsync(text: string): Promise<boolean> {
  clipboardStub.text = text;
  return true;
}
