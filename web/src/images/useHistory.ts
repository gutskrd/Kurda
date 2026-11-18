import { useCallback, useMemo, useRef, useState } from 'react';

/** How many steps back undo can go. */
export const HISTORY_DEPTH = 60;

export interface History<T> {
  present: T;
  canUndo: boolean;
  canRedo: boolean;
  /** A discrete change (a sticker added, a font chosen): its own step. */
  set: (next: T) => void;
  /** A change mid-gesture (a drag, a moving slider): not a step yet. */
  preview: (next: T) => void;
  /** Ends the gesture, making everything since it began one step. */
  settle: () => void;
  undo: () => void;
  redo: () => void;
  /** Starts again from a new document, forgetting everything. */
  reset: (value: T) => void;
}

interface Stacks<T> {
  past: T[];
  present: T;
  future: T[];
}

/**
 * Undo and redo over an immutable value. `set` records a discrete step; `preview` updates the value during a gesture,
 * remembering the state before it once; `settle` turns the gesture into a single step, or nothing if it ended where it
 * began.
 */
export function useHistory<T>(initial: T): History<T> {
  const [stacks, setStacks] = useState<Stacks<T>>({ past: [], present: initial, future: [] });
  /** The value when the current gesture started, or null between gestures. */
  const gestureBase = useRef<{ value: T } | null>(null);

  const push = useCallback((past: T[], entry: T): T[] => {
    const next = [...past, entry];
    return next.length > HISTORY_DEPTH ? next.slice(next.length - HISTORY_DEPTH) : next;
  }, []);

  const set = useCallback(
    (next: T): void => {
      // An open gesture is closed first, so it and this discrete change are separate steps.
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
      // A gesture that changed nothing leaves no trace.
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
