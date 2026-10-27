import { useSyncExternalStore } from 'react';
import { maintenanceNoticeOf, type MaintenanceNotice, type StatusResponse } from '@kurda/shared';
import type { ApiClient } from '../api/client';

/**
 * Hevalo taken offline for a while, from the admin console (shared
 * maintenance.ts).
 *
 * One notice for the whole app, kept here rather than in a context, because
 * what hears of it first is the API client, which has no React in it: any call
 * answered 503 MAINTENANCE puts the notice here (api/client.ts `onMaintenance`),
 * and the screen over everything (MaintenanceScreen.tsx) is up for as long as
 * there is one. That screen asks `GET /status` until the answer is null; then
 * the notice goes, and whatever was waiting on it — the screens under it, a
 * session still being restored — asks again (`onMaintenanceOver`).
 */

let notice: MaintenanceNotice | null = null;
const listeners = new Set<() => void>();
const overListeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const same = (a: MaintenanceNotice, b: MaintenanceNotice): boolean =>
  a.title === b.title && a.message === b.message && a.pictureUrl === b.pictureUrl && a.since === b.since && a.backBy === b.backBy;

/** The notice while Hevalo is offline, null while it is open. */
export function currentMaintenance(): MaintenanceNotice | null {
  return notice;
}

/** Put the screen up with this notice, or keep it up with the admin's newer words. */
export function showMaintenance(next: MaintenanceNotice): void {
  if (notice && same(notice, next)) return;
  notice = next;
  emit();
}

/** Hevalo is open again: the screen comes down, and everything waiting on it hears so. */
export function endMaintenance(): void {
  if (!notice) return;
  notice = null;
  emit();
  for (const l of [...overListeners]) l();
}

/** Hear when Hevalo opens again after being offline. Returns how to stop. */
export function onMaintenanceOver(listener: () => void): () => void {
  overListeners.add(listener);
  return () => {
    overListeners.delete(listener);
  };
}

/** The notice while Hevalo is offline, null while it is open; re-renders as it changes. */
export function useMaintenance(): MaintenanceNotice | null {
  return useSyncExternalStore(subscribe, currentMaintenance, () => null);
}

/**
 * Ask `GET /status` (public, no session needed) whether Hevalo is back, and act
 * on the answer: null takes the screen down, a notice keeps it up with what the
 * admin says now. A question that did not get an answer — no connection, the
 * host still waking — says nothing either way, so the screen stays.
 */
export async function checkStatus(client: Pick<ApiClient, 'get'>): Promise<void> {
  const res = await client.get<StatusResponse>('/status');
  if (!res.ok || typeof res.data !== 'object' || res.data === null || !('maintenance' in res.data)) return;
  if (res.data.maintenance === null) {
    endMaintenance();
    return;
  }
  const next = maintenanceNoticeOf(res.data);
  if (next) showMaintenance(next);
}
