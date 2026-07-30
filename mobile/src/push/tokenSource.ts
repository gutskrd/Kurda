import { Platform } from 'react-native';
import type { DevicePush, PushPlatform } from './pushClient';

/** This device's platform, or null on web (no push tokens there). */
export function devicePlatform(): PushPlatform | null {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return null;
}

/**
 * Acquire this device's push token (KUR-094). Returns null until the native
 * notifications integration (expo-notifications) is added — the delivery
 * backend and API endpoints are ready, so wiring the real token source is a
 * self-contained follow-up. Web and simulators without push also return null.
 */
export async function getPushToken(): Promise<DevicePush | null> {
  const platform = devicePlatform();
  if (!platform) return null;
  // TODO(KUR-094 follow-up): Notifications.getDevicePushTokenAsync() +
  // permission request; map to { token, platform }.
  return null;
}
