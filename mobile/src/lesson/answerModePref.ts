import { useEffect, useState } from 'react';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * How this device answers a tile-based translation or listening item: tapping tiles (the default) or typing. Kept
 * per device like keyboard settings, since it depends on the keyboard at hand.
 */
export type AnswerMode = 'tiles' | 'keyboard';

const KEY = 'hevalo_lesson_answer_mode';

let mode: AnswerMode = 'tiles';
let loaded: Promise<void> | null = null;
const listeners = new Set<(mode: AnswerMode) => void>();

function loadAnswerMode(store: DeviceStore = deviceStore): Promise<void> {
  loaded ??= store.get(KEY).then((value) => {
    mode = value === 'keyboard' ? 'keyboard' : 'tiles';
    for (const l of listeners) l(mode);
  });
  return loaded;
}

async function setAnswerMode(next: AnswerMode, store: DeviceStore = deviceStore): Promise<void> {
  mode = next;
  for (const l of listeners) l(mode);
  if (next === 'tiles') await store.remove(KEY);
  else await store.set(KEY, next);
}

/** The device's answer mode, and a setter every open exercise follows. */
export function useAnswerMode(): [AnswerMode, (next: AnswerMode) => void] {
  const [value, setValue] = useState(mode);
  useEffect(() => {
    listeners.add(setValue);
    void loadAnswerMode();
    setValue(mode);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return [value, (next) => void setAnswerMode(next)];
}

/** For tests: back to a device that was never set. */
export function resetAnswerMode(): void {
  mode = 'tiles';
  loaded = null;
}
