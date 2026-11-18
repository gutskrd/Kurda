import { useSyncExternalStore } from 'react';
import type { AppStateStatus } from 'react-native';
import { overrideFor, parseArtSlot, type ArtOverrides, type ArtOverridesResponse, type ArtSlotFamily } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import { assetUrl } from '../api/env';
import type { DeviceStore } from '../keyboard/deviceStore';

/**
 * The pictures an admin has set in place of the app's own art: badges, rank and league emblems, season frames,
 * default profile pictures and event banners (shared `art-slots.ts`).
 *
 * One app-wide list in a module rather than a context, so any medallion can look up its slot in one call. It
 * loads from the stored copy at startup, then from `GET /art/overrides` (no session needed), and again on
 * returning to the foreground after 15 minutes. A failed request keeps the current list, and nothing here throws
 * into a screen. A slot missing from the list draws the built-in art.
 *
 * React Native and device storage are injected at boot (ArtOverridesLoader.tsx), so code that reads this list
 * (the profile picture address) stays testable as plain code.
 */

/** Where the copy on the phone is kept. */
export const ART_OVERRIDES_KEY = 'hevalo_art_overrides_v1';
/** How long a list is trusted before coming back to the app asks for it again. */
export const ART_OVERRIDES_STALE_MS = 15 * 60_000;

const EMPTY: ArtOverrides = Object.freeze({});

let overrides: ArtOverrides = EMPTY;
let version: string | null = null;
/** When the server last answered (ms); 0 before it ever has. */
let fetchedAt = 0;
/** A server list has arrived, so the older stored copy must not replace it. */
let fresh = false;
let restoring: Promise<void> | null = null;
let fetching: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = (): ArtOverrides => overrides;

/**
 * A list as the server or the stored copy gave it, or null if it is not one. Entries with an unknown slot or an
 * unloadable address are dropped.
 */
function readList(value: unknown): { version: string; overrides: ArtOverrides } | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Partial<ArtOverridesResponse>;
  const list = body.overrides as unknown;
  if (typeof body.version !== 'string' || !list || typeof list !== 'object' || Array.isArray(list)) return null;
  const clean: Record<string, string> = {};
  for (const [slot, url] of Object.entries(list as Record<string, unknown>)) {
    const resolved = typeof url === 'string' && parseArtSlot(slot) ? assetUrl(url) : null;
    if (resolved && /^https?:\/\//i.test(resolved)) clean[slot] = resolved;
  }
  return { version: body.version, overrides: Object.freeze(clean) };
}

function apply(next: { version: string; overrides: ArtOverrides }): boolean {
  if (next.version === version && sameList(next.overrides, overrides)) return false;
  version = next.version;
  overrides = Object.keys(next.overrides).length > 0 ? next.overrides : EMPTY;
  emit();
  return true;
}

function sameList(a: ArtOverrides, b: ArtOverrides): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

/** The stored copy, for before the server answers or when it cannot. */
export function restoreArtOverrides(store: DeviceStore): Promise<void> {
  restoring ??= store
    .get(ART_OVERRIDES_KEY)
    .then((raw) => {
      if (!raw || fresh) return;
      const list = readList(JSON.parse(raw));
      if (list) apply(list);
    })
    .catch(() => {
      // A copy that cannot be read is no copy: the art that ships is drawn until the server answers.
    });
  return restoring;
}

/** Fetch the list, one request at a time. Anything but a valid list leaves the current one. Never rejects. */
export function refreshArtOverrides(client: ApiClient, store: DeviceStore, now: () => number = Date.now): Promise<void> {
  fetching ??= (async () => {
    try {
      const res = await client.get<ArtOverridesResponse>('/art/overrides');
      const list = res.ok ? readList(res.data) : null;
      if (!list) return;
      fresh = true;
      fetchedAt = now();
      // Kept for the next start only when it changed: the same list is already the copy on the phone.
      if (apply(list)) await store.set(ART_OVERRIDES_KEY, JSON.stringify({ version: list.version, overrides: list.overrides }));
    } catch {
      // The list the phone had stays: nothing a screen draws depends on this succeeding.
    } finally {
      fetching = null;
    }
  })();
  return fetching;
}

interface AppStateLike {
  addEventListener(type: 'change', listener: (state: AppStateStatus) => void): { remove(): void };
}

/**
 * Start keeping the list at boot: the stored copy, then the server's, refreshed on returning to the foreground
 * when it is more than 15 minutes old. Returns a function that stops listening.
 */
export function startArtOverrides(
  client: ApiClient,
  { store, appState, now = Date.now }: { store: DeviceStore; appState: AppStateLike; now?: () => number },
): () => void {
  void restoreArtOverrides(store).then(() => refreshArtOverrides(client, store, now));
  const sub = appState.addEventListener('change', (state) => {
    if (state === 'active' && now() - fetchedAt >= ART_OVERRIDES_STALE_MS) void refreshArtOverrides(client, store, now);
  });
  return () => sub.remove();
}

/** The whole list as it stands, outside React. */
export function artOverrides(): ArtOverrides {
  return overrides;
}

/** The uploaded picture for a slot, outside React; null means draw the built-in art. */
export function artOverride(family: ArtSlotFamily, key: string | null | undefined, level?: string | null): string | null {
  return key ? overrideFor(overrides, family, key, level) : null;
}

/** The whole list, kept current, for a component that only learns its slots later (a profile picture's address). */
export function useArtOverrides(): ArtOverrides {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * The uploaded picture for a slot, kept current; null means draw the built-in art. A level's own picture wins
 * over the all-levels one (`overrideFor`).
 */
export function useArtOverride(family: ArtSlotFamily, key: string | null | undefined, level?: string | null): string | null {
  const read = (): string | null => artOverride(family, key, level);
  return useSyncExternalStore(subscribe, read, read);
}

/** Back to a phone that has never heard of the list — for tests. */
export function resetArtOverrides(): void {
  overrides = EMPTY;
  version = null;
  fetchedAt = 0;
  fresh = false;
  restoring = null;
  fetching = null;
  emit();
}
