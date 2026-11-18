import type { PushMessage, PushPlatform } from './provider.js';

/**
 * Pure push batching: messages are grouped by platform and chunked to the provider's per-request limit, so one
 * fan-out is a few provider calls rather than one per device.
 */

/** Max messages per provider request. FCM multicast = 500; APNs is per-token. */
export const BATCH_LIMITS: Record<PushPlatform, number> = {
  android: 500,
  ios: 100,
};

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Groups messages by platform and splits each group into provider-sized batches, in a stable order (android, then ios). */
export function batchMessages(messages: readonly PushMessage[]): PushMessage[][] {
  const byPlatform: Record<PushPlatform, PushMessage[]> = { android: [], ios: [] };
  for (const m of messages) byPlatform[m.platform].push(m);

  const batches: PushMessage[][] = [];
  for (const platform of ['android', 'ios'] as const) {
    batches.push(...chunk(byPlatform[platform], BATCH_LIMITS[platform]));
  }
  return batches;
}
