import { useSyncExternalStore } from 'react';
import type { AppStateStatus } from 'react-native';
import { overrideFor, parseArtSlot, type ArtOverrides, type ArtOverridesResponse, type ArtSlotFamily } from '@kurda/shared';
import type { ApiClient } from '../api/client';
import { assetUrl } from '../api/env';
import type { DeviceStore } from '../keyboard/deviceStore';

/**
 * The pictures an admin has put in place of the app's own art: a badge, a rank
 * or league emblem, a season frame, a default profile picture, an event's
 * banner (shared `art-slots.ts`).
 *
 * One list for the whole app, kept here rather than in a context, so every
 * medallion on a screen can look its slot up with one call wherever it is
 * drawn. It is read from the copy kept on the phone as the app starts, asked
 * of the server (`GET /art/overrides`, which needs no session) once, and again
 * when the app comes back to the front after a quarter of an hour. A request
 * that fails keeps the list the phone already had: a picture never disappears
 * because a train went into a tunnel, and nothing here throws into a screen.
 *
 * A slot that is not in the list is drawn from the art that ships, exactly as
 * it was before there was a list at all.
 *
 * Nothing here loads React Native or the device's storage itself: they are
 * handed in where the app boots (ArtOverridesLoader.tsx), so the profile
 * picture's address, which reads this list, stays plain code a test can run.
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
/** A list from the server has arrived, so the copy on the phone is older and must not replace it. */
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
 * A list as the server (or the copy on the phone) gave it, or null when it is
 * not one. Each slot must be a slot's name and each picture an address the
 * phone can load; anything else is left out rather than drawn as a hole.
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

/** The copy kept on the phone, for the moments before the server has answered (and for when it cannot). */
export function restoreArtOverrides(store: DeviceStore): Promise<void> {
  restoring ??= store
    .get(ART_OVERRIDES_KEY)
    .then((raw) => {
      if (!raw || fresh) return;
      const list = readList(JSON.parse(raw));
      if (list) apply(list);
    })
    .catch(() => {
      // a copy that cannot be read is no copy: the art that ships is drawn until the server answers
    });
  return restoring;
}

/**
 * Ask the server for the list. One request at a time; an answer that is not
 * a list, or no answer at all, leaves the list as it was. Never rejects.
 */
export function refreshArtOverrides(client: ApiClient, store: DeviceStore, now: () => number = Date.now): Promise<void> {
  fetching ??= (async () => {
    try {
      const res = await client.get<ArtOverridesResponse>('/art/overrides');
      const list = res.ok ? readList(res.data) : null;
      if (!list) return;
      fresh = true;
      fetchedAt = now();
      // kept for the next start only when it changed: the same list is already the copy on the phone
      if (apply(list)) await store.set(ART_OVERRIDES_KEY, JSON.stringify({ version: list.version, overrides: list.overrides }));
    } catch {
      // the list the phone had stays: nothing a screen draws depends on this succeeding
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
 * Start keeping the list, where the app boots: the copy on the phone first,
 * then the server's, then the server's again whenever the app comes back to
 * the front with a list more than a quarter of an hour old. Answers the
 * function that stops listening.
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

/** The uploaded picture for a slot as the list stands, outside React; null to draw the art that ships. */
export function artOverride(family: ArtSlotFamily, key: string | null | undefined, level?: string | null): string | null {
  return key ? overrideFor(overrides, family, key, level) : null;
}

/** The whole list, kept current: for a component that looks up slots it only knows of later (a profile picture's address). */
export function useArtOverrides(): ArtOverrides {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * The uploaded picture for a slot, kept current as the list arrives or
 * changes; null to draw the art that ships. A level's own picture wins over
 * the one for every level (`overrideFor`).
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
