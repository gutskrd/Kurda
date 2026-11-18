import { useEffect, useState } from 'react';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * Settings → Vibration: whether this phone buzzes at all. On by default and kept per device, since it is about
 * where the phone is, not who holds it. Read once at startup and held in memory, so deciding to buzz never waits
 * on storage; until it loads, the default (on) stands.
 */
const KEY = 'hevalo_vibration';

let on = true;
let loaded: Promise<void> | null = null;
const listeners = new Set<(on: boolean) => void>();

export function vibrationOn(): boolean {
  return on;
}

/** Read the stored choice; safe to call more than once (it is read the first time only). */
export function loadVibrationPref(store: DeviceStore = deviceStore): Promise<void> {
  loaded ??= store.get(KEY).then((value) => {
    on = value !== 'off';
    for (const l of listeners) l(on);
  });
  return loaded;
}

export async function setVibration(next: boolean, store: DeviceStore = deviceStore): Promise<void> {
  on = next;
  for (const l of listeners) l(on);
  // Stored as the exception only: a phone that never touched the switch has nothing saved.
  if (next) await store.remove(KEY);
  else await store.set(KEY, 'off');
}

/** The switch's state, kept current if it changes somewhere else while the screen is open. */
export function useVibrationPref(): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(on);
  useEffect(() => {
    listeners.add(setValue);
    void loadVibrationPref();
    setValue(on);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return [value, (next) => void setVibration(next)];
}

/** Back to a phone that has never been told anything — for tests. */
export function resetVibrationPref(): void {
  on = true;
  loaded = null;
}
