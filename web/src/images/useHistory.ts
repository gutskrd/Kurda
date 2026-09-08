import { useCallback, useMemo, useRef, useState } from 'react';

/** How many steps back you can go. Deep enough to feel unlimited, bounded enough to forget. */
export const HISTORY_DEPTH = 60;

export interface History<T> {
  present: T;
  canUndo: boolean;
  canRedo: boolean;
  /** A discrete change — added a sticker, chose a font. Its own step. */
  set: (next: T) => void;
  /** A change mid-gesture — a drag, a slider being moved. Not a step yet. */
  preview: (next: T) => void;
  /** The gesture is over. Everything since it began becomes one step. */
  settle: () => void;
  undo: () => void;
  redo: () => void;
  /** Start again from a new document, forgetting everything. */
  reset: (value: T) => void;
}

interface Stacks<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * Undo and redo over a value you replace rather than mutate.
 *
 * The whole difficulty of undo in a direct-manipulation editor is that a drag
 * is not one change. Dragging a sticker across a picture emits a new state on
 * every pointer event, and recording each one means pressing undo two hundred
 * times to put the sticker back — which is not undo, it is rewind.
 *
 * So there are two ways to change the value. `set` is a discrete act and gets
 * its own step. `preview` is a moment inside a gesture: it updates what you see
 * and remembers, once, what things looked like before the gesture started.
 * `settle` closes the gesture and turns all of it into a single step. A drag,
 * however long, costs one press of undo — and a gesture that ends where it
 * began costs nothing at all.
 *
 * Values are treated as immutable: steps share structure rather than copying,
 * so a deep stack of layer lists stays cheap.
 */
export function useHistory<T>(initial: T): History<T> {
  const [stacks, setStacks] = useState<Stacks<T>>({ past: [], present: initial, future: [] });
  /** what the value was when the current gesture started, or null between gestures */
  const gestureBase = useRef<{ value: T } | null>(null);

  const push = useCallback((past: T[], entry: T): T[] => {
    const next = [...past, entry];
    return next.length > HISTORY_DEPTH ? next.slice(next.length - HISTORY_DEPTH) : next;
  }, []);

  const set = useCallback(
    (next: T): void => {
      // a gesture still open when something discrete happens — typing, then
      // reaching for a button — is closed first, so both are steps and neither
      // swallows the other
      const base = gestureBase.current;
      gestureBase.current = null;
      setStacks((s) => {
        if (Object.is(s.present, next)) return s;
        const past = base && !Object.is(base.value, s.present) ? push(s.past, base.value) : s.past;
        return { past: push(past, s.present), present: next, future: [] };
      });
    },
    [push],
  );

  const preview = useCallback((next: T): void => {
    setStacks((s) => {
      if (Object.is(s.present, next)) return s;
      if (!gestureBase.current) gestureBase.current = { value: s.present };
      return { ...s, present: next };
    });
  }, []);

  const settle = useCallback((): void => {
    const base = gestureBase.current;
    gestureBase.current = null;
    if (!base) return;
    setStacks((s) =>
      // a gesture that changed nothing leaves no trace
      Object.is(base.value, s.present) ? s : { past: push(s.past, base.value), present: s.present, future: [] },
    );
  }, [push]);

  const undo = useCallback((): void => {
    gestureBase.current = null;
    setStacks((s) => {
      const previous = s.past[s.past.length - 1];
      if (previous === undefined) return s;
      return { past: s.past.slice(0, -1), present: previous, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback((): void => {
    gestureBase.current = null;
    setStacks((s) => {
      const [next, ...rest] = s.future;
      if (next === undefined) return s;
      return { past: push(s.past, s.present), present: next, future: rest };
    });
  }, [push]);

  const reset = useCallback((value: T): void => {
    gestureBase.current = null;
    setStacks({ past: [], present: value, future: [] });
  }, []);

  return useMemo(
    () => ({
      present: stacks.present,
      canUndo: stacks.past.length > 0,
      canRedo: stacks.future.length > 0,
      set,
      preview,
      settle,
      undo,
      redo,
      reset,
    }),
    [stacks, set, preview, settle, undo, redo, reset],
  );
}
