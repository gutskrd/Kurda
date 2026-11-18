import { useSyncExternalStore } from 'react';
import { overrideFor, parseArtSlot, type ArtOverrides, type ArtOverridesResponse, type ArtSlotFamily } from '@kurda/shared';
import { ApiClient } from '../lib/api';
import { API_URL } from '../lib/config';
import type { TokenStorage } from '../lib/tokenStorage';
import { avatarSrc } from '../lib/cosmetics';

/**
 * Pictures an admin uploaded in place of built-in art slots (@kurda/shared art-slots.ts). One list for the page,
 * fetched at start-up and again when a tab returns after a while, and cached in this browser so a returning visitor
 * sees the replacements from the first frame. Nothing here throws: a failed fetch keeps the last good list.
 */

export const ART_OVERRIDES_KEY = 'hevalo.art-overrides.v1';

/** How long a list is trusted before a tab coming back into view asks again. */
export const ART_OVERRIDES_STALE_MS = 15 * 60_000;

interface Held {
  version: string | null;
  overrides: ArtOverrides;
}

const NONE: Held = Object.freeze({ version: null, overrides: Object.freeze({}) });

let held: Held | null = null;
/** When the server was last asked, whatever it answered (ms since the epoch). */
let askedAt = 0;
let inFlight: Promise<void> | null = null;
let stopWatching: (() => void) | null = null;
const listeners = new Set<() => void>();

/*
 * The list is public, so it uses its own client with an empty token store: a client reading the real store could
 * start a token refresh alongside the session's own.
 */
const NO_SESSION: TokenStorage = { get: () => null, set: () => undefined, clear: () => undefined };
let client: ApiClient | null = null;
function api(): ApiClient {
  return (client ??= new ApiClient(API_URL, NO_SESSION, () => undefined));
}

/** Whether the page may load a picture from this address: https, or http only while the API itself is (a local server). */
function isPictureUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || (protocol === 'http:' && API_URL.startsWith('http://'));
  } catch {
    return false;
  }
}

/**
 * Parses a list from the server or the browser's copy, or null when it is not one. Bad entries are dropped one at a
 * time, so one never costs the rest.
 */
export function parseArtOverrides(raw: unknown): Held | null {
  if (!raw || typeof raw !== 'object') return null;
  const { version, overrides } = raw as { version?: unknown; overrides?: unknown };
  if (typeof version !== 'string' || !overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return null;
  const kept: Record<string, string> = {};
  for (const [slot, url] of Object.entries(overrides)) {
    if (typeof url === 'string' && parseArtSlot(slot) && isPictureUrl(url)) kept[slot] = url;
  }
  return { version, overrides: Object.freeze(kept) };
}

/* Storage can be missing or refuse (a private window, blocked site data); the list then lives for this visit only. */
function readCache(): Held {
  try {
    const raw = localStorage.getItem(ART_OVERRIDES_KEY);
    return (raw ? parseArtOverrides(JSON.parse(raw)) : null) ?? NONE;
  } catch {
    return NONE;
  }
}

function writeCache(next: Held): void {
  try {
    localStorage.setItem(ART_OVERRIDES_KEY, JSON.stringify({ version: next.version, overrides: next.overrides }));
  } catch {
    // Not kept for next time; this visit still has it.
  }
}

function current(): Held {
  return (held ??= readCache());
}

async function ask(): Promise<void> {
  askedAt = Date.now();
  try {
    const res = await api().get<ArtOverridesResponse>('/art/overrides');
    if (!res.ok) return;
    const next = parseArtOverrides(res.data);
    // The version changes whenever the list does, so the same one is nothing new.
    if (!next || next.version === current().version) return;
    held = next;
    writeCache(next);
    for (const l of listeners) l();
  } catch {
    // Keep the last good list.
  }
}

/** Fetches the list now, one request at a time. Never rejects. */
export function refreshArtOverrides(): Promise<void> {
  if (!inFlight) {
    const asking: Promise<void> = ask().finally(() => {
      if (inFlight === asking) inFlight = null;
    });
    inFlight = asking;
  }
  return inFlight;
}

/**
 * Loads the list and refetches it when the tab returns to view or the window gets focus, once the list is older
 * than `ART_OVERRIDES_STALE_MS`. Called from the app's entry; calling it twice changes nothing.
 */
export function startArtOverrides(): void {
  if (stopWatching) return;
  void refreshArtOverrides();
  const again = (): void => {
    if (document.visibilityState === 'hidden') return;
    if (Date.now() - askedAt > ART_OVERRIDES_STALE_MS) void refreshArtOverrides();
  };
  try {
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    stopWatching = () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('focus', again);
    };
  } catch {
    stopWatching = () => undefined;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Every replaced picture by slot, as things stand. */
export function currentArtOverrides(): ArtOverrides {
  return current().overrides;
}

/** Every replaced picture by slot, re-rendering whenever the list changes. */
export function useArtOverrides(): ArtOverrides {
  return useSyncExternalStore(subscribe, currentArtOverrides, currentArtOverrides);
}

/** The uploaded picture for a slot (the level's own first), or null to draw the built-in art. */
export function useArtOverride(family: ArtSlotFamily, key: string, level?: string | null): string | null {
  return overrideFor(useArtOverrides(), family, key, level);
}

/** A person's avatar, with any replacement for a default profile picture applied (lib/cosmetics.ts `avatarSrc`). */
export function useAvatarSrc(url: string | null | undefined): string | null {
  return avatarSrc(url, useArtOverrides());
}

/** For tests: forgets the list and stops watching the tab, as a reload would; the browser's copy stays. */
export function resetArtOverridesForTests(): void {
  stopWatching?.();
  stopWatching = null;
  held = null;
  askedAt = 0;
  inFlight = null;
  client = null;
  for (const l of listeners) l();
}
