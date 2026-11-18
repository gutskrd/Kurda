import { useEffect, useState } from 'react';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * An on/off setting kept on this device and on by default (Sounds, Vibration, spoken answers). It is read once and
 * held in memory, so checking it never waits on storage, and only "off" is stored.
 */
export interface DeviceSwitch {
  isOn(): boolean;
  /** Read the stored choice; safe to call more than once (it is read the first time only). */
  load(store?: DeviceStore): Promise<void>;
  set(next: boolean, store?: DeviceStore): Promise<void>;
  /** The switch's state, kept current if it changes somewhere else while the screen is open. */
  use(): [boolean, (next: boolean) => void];
  /** Back to a phone that has never been told anything, for tests. */
  reset(): void;
}

export function deviceSwitch(key: string): DeviceSwitch {
  let on = true;
  let loaded: Promise<void> | null = null;
  const listeners = new Set<(on: boolean) => void>();
  const notify = (): void => {
    for (const l of listeners) l(on);
  };

  const load = (store: DeviceStore = deviceStore): Promise<void> => {
    loaded ??= store.get(key).then((value) => {
      on = value !== 'off';
      notify();
    });
    return loaded;
  };

  const set = async (next: boolean, store: DeviceStore = deviceStore): Promise<void> => {
    on = next;
    notify();
    // Stored as the exception only: a phone that never touched the switch has nothing saved.
    if (next) await store.remove(key);
    else await store.set(key, 'off');
  };

  function useSwitch(): [boolean, (next: boolean) => void] {
    const [value, setValue] = useState(on);
    useEffect(() => {
      listeners.add(setValue);
      void load();
      setValue(on);
      return () => {
        listeners.delete(setValue);
      };
    }, []);
    return [value, (next) => void set(next)];
  }

  return {
    isOn: () => on,
    load,
    set,
    use: useSwitch,
    reset: () => {
      on = true;
      loaded = null;
    },
  };
}
