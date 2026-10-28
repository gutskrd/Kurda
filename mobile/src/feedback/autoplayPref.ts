import { useEffect, useState } from 'react';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * Settings → Sounds: whether a lesson says its Kurdish by itself after each
 * answer — the native recording, a moment after the verdict. Off, it waits for
 * a tap on "Hear it", as it always could. (A listening exercise's clip plays
 * as it opens either way: there, the sound is the question.)
 *
 * Hearing the sentence right after answering it, while the answer is still on
 * screen, is the cheapest way to tie the sound to the spelling; but a phone on
 * a bus may not want to speak up unasked, so it can be turned off. On by
 * default and kept on the device, as Sounds is (soundPref.ts).
 */
const KEY = 'hevalo_autoplay_audio';

let on = true;
let loaded: Promise<void> | null = null;
const listeners = new Set<(on: boolean) => void>();

export function autoplayOn(): boolean {
  return on;
}

export function loadAutoplayPref(store: DeviceStore = deviceStore): Promise<void> {
  loaded ??= store.get(KEY).then((value) => {
    on = value !== 'off';
    for (const l of listeners) l(on);
  });
  return loaded;
}

export async function setAutoplay(next: boolean, store: DeviceStore = deviceStore): Promise<void> {
  on = next;
  for (const l of listeners) l(on);
  if (next) await store.remove(KEY);
  else await store.set(KEY, 'off');
}

/** The switch's state, kept current if it changes somewhere else while the screen is open. */
export function useAutoplayPref(): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(on);
  useEffect(() => {
    listeners.add(setValue);
    void loadAutoplayPref();
    setValue(on);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return [value, (next) => void setAutoplay(next)];
}

/** Back to a phone that has never been told anything — for tests. */
export function resetAutoplayPref(): void {
  on = true;
  loaded = null;
}
