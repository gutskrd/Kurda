import { useSyncExternalStore } from 'react';

/**
 * The screen in front, for what is drawn over the navigator rather than inside it (the parental pause), which cannot
 * read the stack's state itself. The navigation container reports each change; only the name and a Settings page's
 * key are kept, never other params.
 */
export interface CurrentRoute {
  name: string | null;
  /** The Settings page open, when the screen is one. */
  page: string | null;
}

let current: CurrentRoute = { name: null, page: null };
const listeners = new Set<() => void>();

export function noteCurrentRoute(route: { name: string; params?: object } | undefined): void {
  const page = route?.name === 'SettingsPage' ? ((route.params as { page?: unknown } | undefined)?.page ?? null) : null;
  const next: CurrentRoute = { name: route?.name ?? null, page: typeof page === 'string' ? page : null };
  if (next.name === current.name && next.page === current.page) return;
  current = next;
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = (): CurrentRoute => current;

export function useCurrentRoute(): CurrentRoute {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
