import { useEffect, useSyncExternalStore } from 'react';
import { API_URL } from '../lib/config';
import { CLIPS } from './clips';
import type { SoraniLetter } from './letters';

/**
 * Where each sound is. The clips are files on this site (see
 * scripts/alphabet-audio/generate.py), so playing one costs a few kilobytes
 * from the edge and no request to anybody's server.
 *
 * A key with no clip answers null, and the page shows no play button there:
 * a sound that could not be made accurately is left out rather than guessed.
 */
const BASE = '/audio/alphabet/';

/*
 * Recordings made in the admin panel, by key. A recording wins over the
 * synthesised clip for its key; until they arrive (or if the API is asleep or
 * unreachable) the synthesised clips play, so the page never waits on them.
 */
let recorded: Readonly<Record<string, string>> = {};
let version = 0;
let loading: Promise<void> | null = null;
const changed = new Set<() => void>();

export function loadRecordings(): Promise<void> {
  loading ??= fetch(`${API_URL}/alphabet/audio`)
    .then((res) => (res.ok ? (res.json() as Promise<{ clips?: Record<string, unknown> }>) : { clips: {} }))
    .then(({ clips }) => {
      // only https URLs to keys the page knows: anything else is not ours to play
      const ok = Object.entries(clips ?? {}).filter(
        (e): e is [string, string] => e[0] in CLIPS && typeof e[1] === 'string' && e[1].startsWith('https://'),
      );
      if (ok.length === 0) return;
      recorded = Object.fromEntries(ok);
      version++;
      changed.forEach((f) => f());
    })
    .catch(() => undefined);
  return loading;
}

/** Re-render when the recordings arrive. Call it once, high in the page. */
export function useRecordings(): number {
  useEffect(() => void loadRecordings(), []);
  return useSyncExternalStore(
    (f) => {
      changed.add(f);
      return () => changed.delete(f);
    },
    () => version,
  );
}

/** True for a synthesised clip, so the page can say so — and only then. */
export function isSynthesised(src: string | null): boolean {
  return !!src && src.startsWith(BASE);
}

function clip(key: string): string | null {
  const own = recorded[key];
  if (own) return own;
  const file = CLIPS[key];
  return file ? BASE + file : null;
}

export const latinSound = (id: string): string | null => clip(`kmr:sound:${id}`);
export const latinWord = (id: string): string | null => clip(`kmr:word:${id}`);
export const pairWord = (word: string): string | null => clip(`pair:${word}`);

/** A Soranî letter's sound: its own where only Soranî has one, else its Kurmancî partner's — the same sound. */
export function soraniSound(l: SoraniLetter): string | null {
  return clip(`ckb:sound:${l.id}`) ?? (l.latin ? latinSound(l.latin) : null);
}
export const soraniWord = (l: SoraniLetter): string | null => clip(`ckb:word:${l.id}`);

/*
 * One player for the whole page: a new sound stops the last one rather than
 * talking over it, which is what a tap on a second letter means.
 */
let player: HTMLAudioElement | null = null;
let current: string | null = null;
const listeners = new Set<(src: string | null) => void>();

export function play(src: string): void {
  if (!player) {
    player = new Audio();
    // the events, not the calls, say what is sounding: a pause from switching clips arrives before the new one plays
    const now = (s: string | null) => () => listeners.forEach((l) => l(s));
    player.addEventListener('playing', () => listeners.forEach((l) => l(current)));
    player.addEventListener('ended', now(null));
    player.addEventListener('pause', now(null));
    player.addEventListener('error', now(null));
  }
  player.pause();
  current = src;
  player.src = src;
  const started = player.play() as Promise<void> | undefined;
  started?.catch(() => listeners.forEach((l) => l(null)));
}

export function onPlaying(listener: (src: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
