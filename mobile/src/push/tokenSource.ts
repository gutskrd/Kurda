import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { DevicePush, PushPlatform } from './pushClient';
import { ensureChannel, readPermission } from './device';

/** This device's platform, or null on web (no push tokens there). */
export function devicePlatform(): PushPlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/** The EAS project an Expo push token is issued for: app.json's `extra.eas.projectId`. */
export function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const id = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * This device's Expo push token, for the API to send through the push service, or null: on the web, while
 * notifications are not allowed, and wherever no token can be had (a simulator, no connection, an Android build
 * without its push configuration). Never asks for permission (see permission.ts).
 */
export async function getPushToken(channelName?: string): Promise<DevicePush | null> {
  const platform = devicePlatform();
  if (!platform) return null;
  const permission = await readPermission();
  if (permission.status !== 'granted') return null;
  const projectId = easProjectId();
  if (!projectId) return null;
  // Allowed in the phone's settings rather than through the app: the channel may not exist yet, and its name is
  // what the phone's settings show.
  if (channelName) await ensureChannel(channelName);
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data ? { token: data, platform } : null;
  } catch {
    return null;
  }
}
