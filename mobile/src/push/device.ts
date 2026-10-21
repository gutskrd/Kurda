import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import { PUSH_UNAVAILABLE, toPermissionState, type PushPermissionState } from './permission';

/**
 * The phone's side of notifications permission (KUR-094): reading it, asking
 * for it, and the way to the phone's own settings. The rules for *when* to ask
 * are in permission.ts; this only does what it is told.
 */

/** The Android channel every push lands in; the API names it on each message (push/provider.ts). */
export const ANDROID_CHANNEL_ID = 'default';

/** Push exists on the phone builds only; the web build has no token to give. */
export function pushSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function readPermission(): Promise<PushPermissionState> {
  if (!pushSupported()) return PUSH_UNAVAILABLE;
  try {
    return toPermissionState(await Notifications.getPermissionsAsync());
  } catch {
    return PUSH_UNAVAILABLE;
  }
}

/**
 * The channel Android files the notifications under, named in the reader's
 * language (it is what the phone's settings list). Android 13 shows no
 * permission prompt until an app has a channel, so it is made before asking.
 * Default importance: a sound and a place in the shade, never a banner over
 * whatever the person is doing.
 */
export async function ensureChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // without it the system's own fallback channel is used; nothing to tell anyone
  }
}

const granted = new Set<() => void>();

/** Called when this app has just been allowed to notify (PushRegistration then registers the phone). */
export function onPermissionGranted(listener: () => void): () => void {
  granted.add(listener);
  return () => {
    granted.delete(listener);
  };
}

/** Show the system prompt, and say what came of it. Only ever called from a tap. */
export async function requestPermission(channelName: string): Promise<PushPermissionState> {
  if (!pushSupported()) return PUSH_UNAVAILABLE;
  await ensureChannel(channelName);
  let state: PushPermissionState;
  try {
    state = toPermissionState(await Notifications.requestPermissionsAsync());
  } catch {
    state = await readPermission();
  }
  if (state.status === 'granted') for (const listener of [...granted]) listener();
  return state;
}

/** This app's page in the phone's settings, where a "no" given to the system prompt can be changed. */
export function openPhoneSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}
