import type { ApiClient } from '../api/client';

export type PushPlatform = 'ios' | 'android';

export interface DevicePush {
  token: string;
  platform: PushPlatform;
}

/** Register or refresh this device's push token with the backend. */
export function registerDevice(client: ApiClient, device: DevicePush): Promise<unknown> {
  return client.post('/me/devices', device);
}

/** Unregister on logout so we stop pushing to this device. */
export function removeDevice(client: ApiClient, token: string): Promise<unknown> {
  return client.post('/me/devices/remove', { token });
}
