import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlphabetScript } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * Which letters this reader has opened, per alphabet, on this device only and never sent, as the web keeps them
 * in the browser. A failing store just means no ticks.
 */
export const SEEN_KEY = 'hevalo_alphabet_seen_v1';

export type Seen = Record<AlphabetScript, string[]>;

const NONE: Seen = { kmr: [], ckb: [] };

/** What was stored, read field by field; anything else counts as nothing opened. */
export function parseSeen(raw: string | null | undefined): Seen {
  if (!raw) return NONE;
  try {
    const v = JSON.parse(raw) as Partial<Record<AlphabetScript, unknown>> | null;
    const list = (x: unknown): string[] => (Array.isArray(x) ? x.filter((id): id is string => typeof id === 'string') : []);
    return v && typeof v === 'object' ? { kmr: list(v.kmr), ckb: list(v.ckb) } : NONE;
  } catch {
    return NONE;
  }
}

/** The letters opened in `script` and a way to add one, or under another `key` a word set's words. */
export function useSeen(
  script: AlphabetScript,
  store: DeviceStore = deviceStore,
  key: string = SEEN_KEY,
): [ReadonlySet<string>, (id: string) => void] {
  const [all, setAll] = useState<Seen>(NONE);
  const latest = useRef<Seen>(NONE);

  useEffect(() => {
    let live = true;
    void store.get(key).then((raw) => {
      if (!live) return;
      // A letter opened before the stored ones arrived is kept with them, not lost under them.
      const early = latest.current;
      const saved = parseSeen(raw);
      const merge = (s: AlphabetScript) => [...new Set([...saved[s], ...early[s]])];
      const next = { kmr: merge('kmr'), ckb: merge('ckb') };
      latest.current = next;
      setAll(next);
      if (early.kmr.length + early.ckb.length > 0) void store.set(key, JSON.stringify(next));
    });
    return () => {
      live = false;
    };
  }, [store, key]);

  const mark = useCallback(
    (id: string) => {
      const was = latest.current;
      if (was[script].includes(id)) return;
      const next = { ...was, [script]: [...was[script], id] };
      latest.current = next;
      setAll(next);
      void store.set(key, JSON.stringify(next));
    },
    [script, store, key],
  );

  return [useMemo(() => new Set(all[script]), [all, script]), mark];
}
