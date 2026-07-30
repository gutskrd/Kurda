import type { PushMessage, PushPlatform } from './provider.js';

/**
 * Pure batching for the push pipeline (KUR-094). Messages are grouped by
 * platform (each maps to its own provider — FCM/APNs) and chunked to that
 * provider's per-request limit, so one `notifyUser` fan-out becomes a small
 * number of provider calls rather than one call per device.
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

/**
 * Group messages by platform and split each group into provider-sized batches.
 * Order is stable (android then ios) so tests and logs are deterministic.
 */
export function batchMessages(messages: readonly PushMessage[]): PushMessage[][] {
  const byPlatform: Record<PushPlatform, PushMessage[]> = { android: [], ios: [] };
  for (const m of messages) byPlatform[m.platform].push(m);

  const batches: PushMessage[][] = [];
  for (const platform of ['android', 'ios'] as const) {
    batches.push(...chunk(byPlatform[platform], BATCH_LIMITS[platform]));
  }
  return batches;
}
