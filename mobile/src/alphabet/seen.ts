import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlphabetScript } from '@kurda/shared';
import { deviceStore, type DeviceStore } from '../keyboard/deviceStore';

/**
 * Which letters this reader has opened, per alphabet — on this phone only and
 * never sent anywhere, as the website keeps them in its browser. Seeing the
 * ticks add up is the small, honest kind of progress that keeps someone
 * going; a store that fails just means no ticks.
 */
export const SEEN_KEY = 'hevalo_alphabet_seen_v1';

export type Seen = Record<AlphabetScript, string[]>;

const NONE: Seen = { kmr: [], ckb: [] };

/** What was stored, read field by field: anything else counts as nothing opened yet. */
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

/** The letters opened in `script`, and a way to add one. */
export function useSeen(script: AlphabetScript, store: DeviceStore = deviceStore): [ReadonlySet<string>, (id: string) => void] {
  const [all, setAll] = useState<Seen>(NONE);
  const latest = useRef<Seen>(NONE);

  useEffect(() => {
    let live = true;
    void store.get(SEEN_KEY).then((raw) => {
      if (!live) return;
      // a letter opened before the stored ones arrived is kept with them, not lost under them
      const early = latest.current;
      const saved = parseSeen(raw);
      const merge = (s: AlphabetScript) => [...new Set([...saved[s], ...early[s]])];
      const next = { kmr: merge('kmr'), ckb: merge('ckb') };
      latest.current = next;
      setAll(next);
      if (early.kmr.length + early.ckb.length > 0) void store.set(SEEN_KEY, JSON.stringify(next));
    });
    return () => {
      live = false;
    };
  }, [store]);

  const mark = useCallback(
    (id: string) => {
      const was = latest.current;
      if (was[script].includes(id)) return;
      const next = { ...was, [script]: [...was[script], id] };
      latest.current = next;
      setAll(next);
      void store.set(SEEN_KEY, JSON.stringify(next));
    },
    [script, store],
  );

  return [useMemo(() => new Set(all[script]), [all, script]), mark];
}
