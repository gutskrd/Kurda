import { useSyncExternalStore } from 'react';
import { overrideFor, parseArtSlot, type ArtOverrides, type ArtOverridesResponse, type ArtSlotFamily } from '@kurda/shared';
import { ApiClient } from '../lib/api';
import { API_URL } from '../lib/config';
import type { TokenStorage } from '../lib/tokenStorage';
import { avatarSrc } from '../lib/cosmetics';

/**
 * Pictures an admin has put in place of the art that ships (@kurda/shared
 * art-slots.ts): a badge, a rank or league emblem, a season frame, a default
 * profile picture. The art the site draws itself stays the default; wherever
 * a slot has an uploaded picture, that picture is drawn instead.
 *
 * One list for the whole page, asked for once when the app starts and again
 * when the tab comes back into view after a while. The last list that arrived
 * is kept in this browser, so a returning visitor sees the replaced pictures
 * from the first frame rather than the built-in ones flicking over to them.
 *
 * Nothing here ever throws into the page: a list that will not come (the API
 * asleep, the network gone, an answer that makes no sense) leaves the last
 * good one where it is, and with none at all every slot simply draws its own art.
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
/** when the server was last asked, whatever it answered (ms since the epoch) */
let askedAt = 0;
let inFlight: Promise<void> | null = null;
let stopWatching: (() => void) | null = null;
const listeners = new Set<() => void>();

/*
 * The list is public and the same for everybody, so it is asked for without
 * the session: a client of its own with nothing in its token store. Sharing the
 * signed-in client would attach a token this request does not need, and a
 * second client reading the real store could start a token refresh of its own
 * alongside the one the session is already making.
 */
const NO_SESSION: TokenStorage = { get: () => null, set: () => undefined, clear: () => undefined };
let client: ApiClient | null = null;
function api(): ApiClient {
  return (client ??= new ApiClient(API_URL, NO_SESSION, () => undefined));
}

/** A picture's address is a web address the page may load: https, or http only while the API itself is (a local server). */
function isPictureUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || (protocol === 'http:' && API_URL.startsWith('http://'));
  } catch {
    return false;
  }
}

/**
 * A list as the server (or this browser's copy) holds it, or null when it is
 * not one. Entries that are not a slot's name, or whose picture is not a web
 * address, are left out one at a time, so one bad entry never costs the rest.
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

/* Storage can be missing or refuse (a private window, blocked site data): then the list lives for this visit only. */
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
    // not kept for next time; this visit still has it
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
    // the version changes whenever the list does: the same one is nothing new to draw
    if (!next || next.version === current().version) return;
    held = next;
    writeCache(next);
    for (const l of listeners) l();
  } catch {
    // keep the last good list
  }
}

/** Ask for the list now (once at a time). Resolves when the answer, or the lack of one, is in; never rejects. */
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
 * Load the list once and keep it fresh: called from the app's entry. A tab
 * that comes back into view (or a window that gets focus) asks again once the
 * list is more than a quarter of an hour old. Calling it twice changes nothing.
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

/** Every replaced picture by slot, as things stand: for a plain function, or a list drawing many. */
export function currentArtOverrides(): ArtOverrides {
  return current().overrides;
}

/** The version of the list in hand, or null before any has arrived. */
export function artOverridesVersion(): string | null {
  return current().version;
}

/** The uploaded picture for a slot right now, or null to draw the art that ships. */
export function artOverride(family: ArtSlotFamily, key: string, level?: string | null): string | null {
  return overrideFor(current().overrides, family, key, level);
}

/** Every replaced picture by slot, drawn again whenever the list changes. */
export function useArtOverrides(): ArtOverrides {
  return useSyncExternalStore(subscribe, currentArtOverrides, currentArtOverrides);
}

/** The uploaded picture for a slot (the level's own first), or null to draw the art that ships. */
export function useArtOverride(family: ArtSlotFamily, key: string, level?: string | null): string | null {
  return overrideFor(useArtOverrides(), family, key, level);
}

/**
 * A person's avatar as the server resolved it, with a default profile
 * picture's replacement in its place (lib/cosmetics.ts `avatarSrc`).
 */
export function useAvatarSrc(url: string | null | undefined): string | null {
  return avatarSrc(url, useArtOverrides());
}

/** For tests: forget the list and stop watching the tab, as a reload would (this browser's copy stays). */
export function resetArtOverridesForTests(): void {
  stopWatching?.();
  stopWatching = null;
  held = null;
  askedAt = 0;
  inFlight = null;
  client = null;
  for (const l of listeners) l();
}
