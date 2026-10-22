import { useEffect, useState } from 'react';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * Settings → Sounds: whether the app's own chimes play (a right answer, a
 * lesson finished, something earned). The lesson's spoken Kurdish is not one
 * of them and always plays.
 *
 * On by default and kept on the device, as Vibration is (vibrationPref.ts),
 * and for the same reason: it is about where the phone is, not who holds it.
 */
const KEY = 'hevalo_sounds';

let on = true;
let loaded: Promise<void> | null = null;
const listeners = new Set<(on: boolean) => void>();

export function soundsOn(): boolean {
  return on;
}

export function loadSoundPref(store: DeviceStore = deviceStore): Promise<void> {
  loaded ??= store.get(KEY).then((value) => {
    on = value !== 'off';
    for (const l of listeners) l(on);
  });
  return loaded;
}

export async function setSounds(next: boolean, store: DeviceStore = deviceStore): Promise<void> {
  on = next;
  for (const l of listeners) l(on);
  if (next) await store.remove(KEY);
  else await store.set(KEY, 'off');
}

/** The switch's state, kept current if it changes somewhere else while the screen is open. */
export function useSoundPref(): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(on);
  useEffect(() => {
    listeners.add(setValue);
    void loadSoundPref();
    setValue(on);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return [value, (next) => void setSounds(next)];
}

/** Back to a phone that has never been told anything — for tests. */
export function resetSoundPref(): void {
  on = true;
  loaded = null;
}
