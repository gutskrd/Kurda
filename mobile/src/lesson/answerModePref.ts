import { useEffect, useState } from 'react';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * How this device answers a translation or a listening item that comes with
 * word tiles: by tapping the tiles (the default), or by typing. Kept on the
 * device, as the keyboard settings are: it is about the keyboard in front of
 * you — somebody with a Kurdish keyboard on this phone may well rather type.
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

/** The way this device answers, and a way to change it that every open exercise follows. */
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

/** Back to a phone that has never been told anything — for tests. */
export function resetAnswerMode(): void {
  mode = 'tiles';
  loaded = null;
}
