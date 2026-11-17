import { useSyncExternalStore } from 'react';
import { maintenanceNoticeOf, type MaintenanceNotice, type StatusResponse } from '@kurda/shared';
import type { ApiClient } from '../api/client';

/**
 * The app-wide maintenance notice (shared maintenance.ts). It lives in a module rather than a context because the
 * API client, which has no React, sets it: any 503 MAINTENANCE response puts it here (api/client.ts
 * `onMaintenance`), and MaintenanceScreen shows while it is set. When `GET /status` answers null the notice
 * clears and anything waiting on it retries (`onMaintenanceOver`).
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
 * Ask the public `GET /status` whether Hevalo is back: null clears the notice, a notice updates it. No answer (no
 * connection, a host still starting) changes nothing.
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
