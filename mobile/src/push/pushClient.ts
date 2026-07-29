import type { ApiClient } from '../api/client';

export type PushPlatform = 'ios' | 'android';

export interface DevicePush {
  token: string;
  platform: PushPlatform;
}

/** Register/refresh this device's push token with the backend (KUR-094). */
export function registerDevice(client: ApiClient, device: DevicePush): Promise<unknown> {
  return client.post('/me/devices', device);
}

/** Heartbeat so the backend can prune stale devices. */
export function heartbeatDevice(client: ApiClient, token: string): Promise<unknown> {
  return client.post('/me/devices/heartbeat', { token });
}

/** Unregister on logout so we stop pushing to this device. */
export function removeDevice(client: ApiClient, token: string): Promise<unknown> {
  return client.post('/me/devices/remove', { token });
}
